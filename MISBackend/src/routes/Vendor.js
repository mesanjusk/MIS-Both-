const { requireAuth } = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const VendorMaster = require('../repositories/vendorMaster');
const VendorLedger = require('../repositories/vendorLedger');
const ProductionJob = require('../repositories/productionJob');
const StockMovement = require('../repositories/stockMovement');
const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const { getAttendanceConfig, saveAttendanceConfig } = require('../services/whatsappAttendanceService');
const { getTemplates, saveTemplates } = require('../services/whatsappTemplateService');
const { upsertVendorJob } = require('../services/vendorJobService');
const logger = require('../utils/logger');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildLedgerSummary(entries = []) {
  let debit = 0;
  let credit = 0;
  for (const entry of entries) {
    const amount = Number(entry.amount || 0);
    if (entry.dr_cr === 'dr') debit += amount;
    else credit += amount;
  }
  return {
    debit,
    credit,
    balance: credit - debit,
    balanceNature: credit - debit >= 0 ? 'payable' : 'advance',
  };
}

async function ensureVendorMaster(vendorPayload = {}) {
  if (vendorPayload.vendor_uuid) {
    const existing = await VendorMaster.findOne({ Vendor_uuid: vendorPayload.vendor_uuid });
    if (existing) return existing;
  }

  if (vendorPayload.vendor_name) {
    const existingByName = await VendorMaster.findOne({ Vendor_name: vendorPayload.vendor_name.trim() });
    if (existingByName) return existingByName;
  }

  const created = await VendorMaster.create({
    Vendor_uuid: vendorPayload.vendor_uuid || uuid(),
    Vendor_name: String(vendorPayload.vendor_name || '').trim(),
    Mobile_number: String(vendorPayload.mobile_number || ''),
    Email: String(vendorPayload.email || '').trim(),
    Address: String(vendorPayload.address || ''),
    GST: String(vendorPayload.gst || ''),
    Opening_balance: toNumber(vendorPayload.opening_balance, 0),
    Opening_balance_type: vendorPayload.opening_balance_type || 'none',
    Payment_terms: String(vendorPayload.payment_terms || ''),
    Vendor_type: vendorPayload.vendor_type || 'mixed',
    Active: vendorPayload.active !== false,
    Notes: String(vendorPayload.notes || ''),
    Raw_material_capable: Boolean(vendorPayload.raw_material_capable),
    Jobwork_capable: vendorPayload.jobwork_capable !== false,
  });

  if (created.Opening_balance > 0 && created.Opening_balance_type !== 'none') {
    await VendorLedger.create({
      vendor_uuid: created.Vendor_uuid,
      vendor_name: created.Vendor_name,
      entry_type: 'opening',
      amount: created.Opening_balance,
      dr_cr: created.Opening_balance_type === 'advance' ? 'dr' : 'cr',
      narration: 'Opening balance',
    });
  }

  return created;
}

router.use(requireAuth);

router.post('/addVendor', async (req, res) => {
  try {
    if (!req.body?.Vendor_name && !req.body?.vendor_name) {
      return res.status(400).json({ success: false, message: 'Vendor_name is required' });
    }
    const vendor = await ensureVendorMaster({
      vendor_name: req.body.Vendor_name || req.body.vendor_name,
      mobile_number: req.body.Mobile_number || req.body.mobile_number || req.body.phone,
      vendor_type: req.body.Vendor_type || req.body.vendor_type || 'jobwork',
      notes: req.body.Notes || req.body.notes || '',
    });
    return res.json({ success: true, result: vendor });
  } catch (e) {
    logger.error('Error saving vendor:', e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

router.get('/GetVendorList', async (_req, res) => {
  try {
    const masters = await VendorMaster.find({}).sort({ Vendor_name: 1 }).lean();
    res.json({ success: true, result: [], masters });
  } catch (err) {
    logger.error('Error fetching vendors:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});



router.get('/masters/summary', async (_req, res) => {
  try {
    const [vendors, orders, ledgerEntries, printJobs] = await Promise.all([
      VendorMaster.find({}).sort({ Vendor_name: 1 }).lean(),
      Orders.find({ 'vendorAssignments.0': { $exists: true } }, { Order_Number: 1, Order_uuid: 1, createdAt: 1, vendorAssignments: 1 }).lean(),
      VendorLedger.find({}).lean(),
      ProductionJob.find({ job_category: 'printing' }, { vendor_uuid: 1, jobValue: 1 }).lean(),
    ]);

    const ledgerByVendor = ledgerEntries.reduce((acc, entry) => {
      const key = entry.vendor_uuid;
      if (!acc[key]) acc[key] = { debit: 0, credit: 0 };
      const amount = Number(entry.amount || 0);
      if (entry.dr_cr === 'dr') acc[key].debit += amount;
      else acc[key].credit += amount;
      return acc;
    }, {});

    const assignedByVendor = orders.reduce((acc, order) => {
      (order.vendorAssignments || []).forEach((row) => {
        const key = row.vendorUuid || row.vendorCustomerUuid;
        if (!key) return;
        if (!acc[key]) acc[key] = { totalAssigned: 0, count: 0 };
        acc[key].totalAssigned += Number(row.amount || 0);
        acc[key].count += 1;
      });
      return acc;
    }, {});

    // Print jobs live in ProductionJob (job_category: 'printing') alongside
    // every post-print job — fold them into the same per-vendor totals so a
    // vendor whose only work is printing doesn't show 0 assigned work despite
    // having a real ledger balance.
    for (const job of printJobs) {
      const key = job.vendor_uuid;
      if (!key) continue;
      if (!assignedByVendor[key]) assignedByVendor[key] = { totalAssigned: 0, count: 0 };
      assignedByVendor[key].totalAssigned += Number(job.jobValue || 0);
      assignedByVendor[key].count += 1;
    }

    const result = vendors.map((vendor) => {
      const ledger = ledgerByVendor[vendor.Vendor_uuid] || { debit: 0, credit: 0 };
      const assigned = assignedByVendor[vendor.Vendor_uuid] || { totalAssigned: 0, count: 0 };
      return {
        ...vendor,
        totalWorkAssigned: assigned.totalAssigned,
        totalPaid: ledger.debit,
        balanceDue: Math.max(0, ledger.credit - ledger.debit),
        assignedOrderCount: assigned.count,
      };
    });

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Vendor summary failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/masters/:vendorUuid/order-ledger', async (req, res) => {
  try {
    const vendorUuid = String(req.params.vendorUuid || '').trim();
    const [orders, printJobs] = await Promise.all([
      Orders.find({
        $or: [
          { 'vendorAssignments.vendorUuid': vendorUuid },
          { 'vendorAssignments.vendorCustomerUuid': vendorUuid },
        ],
      }).sort({ createdAt: -1 }).lean(),
      ProductionJob.find({ vendor_uuid: vendorUuid, job_category: 'printing' }).sort({ job_date: -1 }).lean(),
    ]);

    const result = [];
    orders.forEach((order) => {
      (order.vendorAssignments || [])
        .filter((row) => row.vendorUuid === vendorUuid || row.vendorCustomerUuid === vendorUuid)
        .forEach((row) => {
          const amount = Number(row.amount || 0);
          const paid = Number(row.advanceAmount || 0);
          result.push({
            orderUuid: order.Order_uuid,
            orderNumber: order.Order_Number,
            date: order.createdAt,
            workType: row.workType || row.outputItem || 'General',
            amount,
            paid,
            balance: Math.max(0, amount - paid),
            status: row.paymentStatus || row.status || 'pending',
          });
        });
    });

    // Print jobs (ProductionJob, job_category: 'printing') merged in here so
    // the per-order view is complete regardless of which path assigned the
    // work — "paid" is tracked on VendorLedger, not denormalized on the job.
    printJobs.forEach((job) => {
      const amount = Number(job.jobValue || 0);
      result.push({
        orderUuid: job.order_uuid || '',
        orderNumber: job.order_number || null,
        date: job.job_date,
        workType: job.job_type || 'printing',
        amount,
        paid: 0,
        balance: amount,
        status: job.status || 'draft',
      });
    });

    result.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/masters', async (req, res) => {
  try {
    const query = {};
    if (String(req.query.activeOnly || '').toLowerCase() === 'true') query.Active = true;
    const [vendorMasters, customerVendors] = await Promise.all([
      VendorMaster.find(query).sort({ Vendor_name: 1 }).lean(),
      Customers.find({ PartyRoles: 'vendor', Status: 'active' }, {
        Customer_uuid: 1, Customer_name: 1, Mobile_number: 1, Customer_group: 1,
      }).sort({ Customer_name: 1 }).lean(),
    ]);

    const masterUuids = new Set(vendorMasters.map((v) => v.Vendor_uuid));
    const fromCustomers = customerVendors
      .filter((c) => !masterUuids.has(c.Customer_uuid))
      .map((c) => ({
        Vendor_uuid: c.Customer_uuid,
        Vendor_name: c.Customer_name,
        Mobile_number: c.Mobile_number || '',
        Active: true,
        source: 'customer',
        Customer_group: c.Customer_group,
      }));

    const result = [...vendorMasters, ...fromCustomers].sort((a, b) =>
      String(a.Vendor_name).localeCompare(String(b.Vendor_name))
    );
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/masters', async (req, res) => {
  try {
    const vendor = await ensureVendorMaster(req.body || {});
    res.json({ success: true, result: vendor });
  } catch (error) {
    logger.error('Failed to create vendor master', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/masters/:vendorUuid', async (req, res) => {
  try {
    const updated = await VendorMaster.findOneAndUpdate(
      { Vendor_uuid: req.params.vendorUuid },
      {
        $set: {
          Vendor_name: String(req.body.vendor_name || '').trim(),
          Mobile_number: String(req.body.mobile_number || ''),
          Email: String(req.body.email || '').trim(),
          Address: String(req.body.address || ''),
          GST: String(req.body.gst || ''),
          Payment_terms: String(req.body.payment_terms || ''),
          Vendor_type: req.body.vendor_type || 'mixed',
          Active: req.body.active !== false,
          Notes: String(req.body.notes || ''),
          Raw_material_capable: Boolean(req.body.raw_material_capable),
          Jobwork_capable: req.body.jobwork_capable !== false,
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, result: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/orders/list', async (_req, res) => {
  try {
    const orders = await Orders.find({}, { Order_uuid: 1, Order_Number: 1, Items: 1, Customer_uuid: 1, stage: 1, saleSubtotal: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ success: true, result: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/settings/whatsapp-attendance', async (_req, res) => {
  try {
    const config = await getAttendanceConfig();
    res.json({ success: true, result: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/settings/whatsapp-attendance', async (req, res) => {
  try {
    const config = await saveAttendanceConfig(req.body || {});
    res.json({ success: true, result: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/settings/whatsapp-templates', async (_req, res) => {
  try {
    const templates = await getTemplates();
    res.json({ success: true, result: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/settings/whatsapp-templates', async (req, res) => {
  try {
    const templates = await saveTemplates(req.body?.templates || req.body || []);
    res.json({ success: true, result: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/ledger/:vendorUuid', async (req, res) => {
  try {
    const entries = await VendorLedger.find({ vendor_uuid: req.params.vendorUuid }).sort({ date: 1, createdAt: 1 }).lean();
    const summary = buildLedgerSummary(entries);
    res.json({ success: true, result: entries, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/ledger', async (req, res) => {
  try {
    const vendor = await ensureVendorMaster({ vendor_uuid: req.body.vendor_uuid, vendor_name: req.body.vendor_name || req.body.vendorName });
    const created = await VendorLedger.create({
      vendor_uuid: vendor.Vendor_uuid,
      vendor_name: vendor.Vendor_name,
      date: req.body.date || new Date(),
      entry_type: req.body.entry_type,
      job_uuid: req.body.job_uuid || '',
      order_uuid: req.body.order_uuid || '',
      order_number: req.body.order_number || null,
      amount: toNumber(req.body.amount, 0),
      dr_cr: req.body.dr_cr,
      narration: String(req.body.narration || ''),
      transaction_uuid: req.body.transaction_uuid || '',
      reference_type: req.body.reference_type || '',
      reference_id: req.body.reference_id || '',
    });
    res.json({ success: true, result: created });
  } catch (error) {
    logger.error('Failed to create vendor ledger entry', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/production-jobs/by-order/:orderUuid', async (req, res) => {
  try {
    const orderUuid = String(req.params.orderUuid).trim();
    const jobs = await ProductionJob.find({
      $or: [
        { order_uuid: orderUuid },
        { 'linkedOrders.orderUuid': orderUuid },
      ],
    }).sort({ job_date: -1 }).lean();
    res.json({ success: true, result: jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/production-jobs/:jobUuid/status', async (req, res) => {
  try {
    const valid = ['draft', 'in_progress', 'completed', 'cancelled'];
    const status = String(req.body.status || '').toLowerCase();
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const updated = await ProductionJob.findOneAndUpdate(
      { job_uuid: req.params.jobUuid },
      { $set: { status } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, result: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/post-print/payables', async (req, res) => {
  try {
    const jobs = await ProductionJob.find({ job_category: 'post_printing', status: { $ne: 'cancelled' } }).lean();
    const jobUuids = jobs.map((j) => j.job_uuid).filter(Boolean);
    const ledgerEntries = jobUuids.length
      ? await VendorLedger.find({ job_uuid: { $in: jobUuids } }).lean()
      : [];

    const byVendor = {};
    for (const job of jobs) {
      if (!job.vendor_uuid) continue;
      if (!byVendor[job.vendor_uuid]) {
        byVendor[job.vendor_uuid] = {
          vendorUuid: job.vendor_uuid,
          vendorName: job.vendor_name,
          totalJobs: 0,
          totalBilled: 0,
          totalPaid: 0,
          balance: 0,
        };
      }
      byVendor[job.vendor_uuid].totalJobs += 1;
      byVendor[job.vendor_uuid].totalBilled += toNumber(job.jobValue, 0);
    }

    for (const entry of ledgerEntries) {
      if (entry.dr_cr === 'dr' && byVendor[entry.vendor_uuid]) {
        byVendor[entry.vendor_uuid].totalPaid += toNumber(entry.amount, 0);
      }
    }

    const result = Object.values(byVendor)
      .map((v) => ({ ...v, balance: Math.max(0, v.totalBilled - v.totalPaid) }))
      .filter((v) => v.totalBilled > 0)
      .sort((a, b) => b.balance - a.balance);

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/post-print/order-summary', async (req, res) => {
  try {
    const POST_PRINT_STAGES = ['fitting', 'bind_packing'];
    const Customers = require('../repositories/customer');

    const [orders, allJobs] = await Promise.all([
      Orders.find({ stage: { $in: POST_PRINT_STAGES } })
        .select({ Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, stage: 1, saleSubtotal: 1, createdAt: 1 })
        .sort({ createdAt: -1 }).lean(),
      ProductionJob.find({ job_category: 'post_printing' }).lean(),
    ]);

    const customerUuids = [...new Set(orders.map((o) => o.Customer_uuid).filter(Boolean))];
    const customers = customerUuids.length
      ? await Customers.find({ Customer_uuid: { $in: customerUuids } }, { Customer_uuid: 1, Customer_name: 1 }).lean()
      : [];
    const customerMap = Object.fromEntries(customers.map((c) => [c.Customer_uuid, c.Customer_name]));

    const jobsByOrder = {};
    for (const job of allJobs) {
      const uuids = new Set();
      if (job.order_uuid) uuids.add(job.order_uuid);
      (job.linkedOrders || []).forEach((lo) => { if (lo.orderUuid) uuids.add(lo.orderUuid); });
      uuids.forEach((uuid) => {
        if (!jobsByOrder[uuid]) jobsByOrder[uuid] = [];
        jobsByOrder[uuid].push(job);
      });
    }

    const result = orders.map((order) => ({
      ...order,
      customerName: customerMap[order.Customer_uuid] || '',
      jobs: jobsByOrder[order.Order_uuid] || [],
    }));

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/production-jobs', async (req, res) => {
  try {
    const filter = {};
    if (req.query.vendor_uuid) filter.vendor_uuid = String(req.query.vendor_uuid);
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.job_category) filter.job_category = String(req.query.job_category);
    if (req.query.job_type) filter.job_type = String(req.query.job_type);
    if (req.query.order_uuid) {
      filter.$or = [
        { order_uuid: String(req.query.order_uuid) },
        { 'linkedOrders.orderUuid': String(req.query.order_uuid) },
      ];
    }
    if (req.query.fromDate || req.query.toDate) {
      filter.job_date = {};
      if (req.query.fromDate) filter.job_date.$gte = new Date(req.query.fromDate);
      if (req.query.toDate) {
        const end = new Date(req.query.toDate);
        end.setHours(23, 59, 59, 999);
        filter.job_date.$lte = end;
      }
    }
    const jobs = await ProductionJob.find(filter).sort({ job_date: -1, createdAt: -1 }).limit(300).lean();
    res.json({ success: true, result: jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/production-jobs', async (req, res) => {
  try {
    const linkedOrders = Array.isArray(req.body.linkedOrders)
      ? req.body.linkedOrders.map((entry) => ({
          orderUuid: entry.orderUuid || entry.order_uuid || '',
          orderNumber: toNumber(entry.orderNumber || entry.order_number || 0, 0) || null,
          orderItemLineId: entry.orderItemLineId || entry.order_item_line_id || '',
          quantity: toNumber(entry.quantity, 0),
          outputQuantity: toNumber(entry.outputQuantity, 0),
          costShareAmount: toNumber(entry.costShareAmount, 0),
          allocationBasis: entry.allocationBasis || 'manual',
        }))
      : [];

    const { job: created } = await upsertVendorJob({
      jobCategory: req.body.job_category || 'post_printing',
      jobType: req.body.job_type,
      jobMode: req.body.job_mode || 'jobwork_only',
      vendorUuid: req.body.vendor_uuid,
      vendorName: req.body.vendor_name,
      orderUuid: !linkedOrders.length ? String(req.body.order_uuid || '') : undefined,
      orderNumber: !linkedOrders.length ? toNumber(req.body.order_number, 0) || null : undefined,
      linkedOrders,
      dueDate: req.body.job_date,
      expectedCompletion: req.body.expected_completion || null,
      status: req.body.status || 'draft',
      inputItems: Array.isArray(req.body.inputItems) ? req.body.inputItems : [],
      outputItems: Array.isArray(req.body.outputItems) ? req.body.outputItems : [],
      advanceAmount: toNumber(req.body.advanceAmount, 0),
      amount: toNumber(req.body.jobValue, 0),
      materialValue: toNumber(req.body.materialValue, 0),
      otherCharges: toNumber(req.body.otherCharges, 0),
      notes: String(req.body.notes || ''),
      createdBy: String(req.body.createdBy || ''),
      postAccountingBill: false,
      referenceType: 'production_job',
    });

    const stockEntries = [];
    for (const item of created.inputItems || []) {
      if (Number(item.quantity || 0) > 0) {
        stockEntries.push({
          item_uuid: item.itemUuid || '',
          item_name: item.itemName,
          item_type: item.itemType || 'raw',
          movement_type: created.job_mode === 'vendor_with_material' ? 'purchase' : 'issue_to_vendor',
          qty_out: created.job_mode === 'vendor_with_material' ? 0 : Number(item.quantity || 0),
          qty_in: created.job_mode === 'vendor_with_material' ? Number(item.quantity || 0) : 0,
          rate: Number(item.rate || 0),
          value: Number(item.amount || 0),
          vendor_uuid: created.vendor_uuid,
          vendor_name: created.vendor_name,
          order_uuid: created.order_uuid || '',
          order_number: created.order_number || null,
          job_uuid: created.job_uuid,
          reference_type: 'production_job',
          reference_id: created.job_uuid,
          remarks: created.notes,
        });
      }
    }
    for (const item of created.outputItems || []) {
      if (Number(item.quantity || 0) > 0) {
        stockEntries.push({
          item_uuid: item.itemUuid || '',
          item_name: item.itemName,
          item_type: item.itemType || 'finished',
          movement_type: item.itemType === 'finished' ? 'finished_goods_receipt' : 'receive_from_vendor',
          qty_in: Number(item.quantity || 0),
          qty_out: 0,
          rate: Number(item.rate || 0),
          value: Number(item.amount || 0),
          vendor_uuid: created.vendor_uuid,
          vendor_name: created.vendor_name,
          order_uuid: created.order_uuid || '',
          order_number: created.order_number || null,
          job_uuid: created.job_uuid,
          reference_type: 'production_job',
          reference_id: created.job_uuid,
          remarks: created.notes,
        });
      }
    }
    if (stockEntries.length) await StockMovement.insertMany(stockEntries);

    res.json({ success: true, result: created });
  } catch (error) {
    logger.error('Failed to create production job', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/stock-movements', async (req, res) => {
  try {
    const filter = {};
    if (req.query.vendor_uuid) filter.vendor_uuid = String(req.query.vendor_uuid);
    if (req.query.item_name) filter.item_name = String(req.query.item_name);
    const rows = await StockMovement.find(filter).sort({ date: -1, createdAt: -1 }).limit(300).lean();
    res.json({ success: true, result: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/reports/summary', async (_req, res) => {
  try {
    const [vendors, jobs, stockRows, ledgerRows] = await Promise.all([
      VendorMaster.countDocuments(),
      ProductionJob.find({}).lean(),
      StockMovement.find({}).lean(),
      VendorLedger.find({}).lean(),
    ]);

    const ledgerSummary = buildLedgerSummary(ledgerRows);
    const jobValue = jobs.reduce((sum, job) => sum + Number(job.totalCost || 0), 0);
    const stockValue = stockRows.reduce((sum, row) => sum + Number(row.value || 0) * (Number(row.qty_in || 0) > 0 ? 1 : -1), 0);

    const vendorBalances = Object.values(
      ledgerRows.reduce((acc, row) => {
        const key = row.vendor_uuid;
        if (!acc[key]) acc[key] = { vendor_uuid: key, vendor_name: row.vendor_name, debit: 0, credit: 0 };
        if (row.dr_cr === 'dr') acc[key].debit += Number(row.amount || 0);
        else acc[key].credit += Number(row.amount || 0);
        acc[key].balance = acc[key].credit - acc[key].debit;
        return acc;
      }, {})
    ).sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0));

    res.json({
      success: true,
      result: {
        vendorCount: vendors,
        jobCount: jobs.length,
        totalJobCost: jobValue,
        stockNetValue: stockValue,
        totalVendorPayable: ledgerSummary.balance > 0 ? ledgerSummary.balance : 0,
        totalVendorAdvance: ledgerSummary.balance < 0 ? Math.abs(ledgerSummary.balance) : 0,
        topVendorBalances: vendorBalances.slice(0, 10),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
