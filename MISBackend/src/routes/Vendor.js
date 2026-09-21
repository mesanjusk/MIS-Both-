const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const VendorMaster = require('../repositories/vendorMaster');
const VendorLedger = require('../repositories/vendorLedger');
const Transaction = require('../repositories/transaction');
const ProductionJob = require('../repositories/productionJob');
const PurchaseOrder = require('../repositories/purchaseOrder');
const PublicInvoice = require('../repositories/publicInvoice');
const StockMovement = require('../repositories/stockMovement');
const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const { getAttendanceConfig, saveAttendanceConfig } = require('../services/whatsappAttendanceService');
const { getTemplates, saveTemplates } = require('../services/whatsappTemplateService');
const { upsertVendorJob } = require('../services/vendorJobService');
const { ACCOUNT_PAYABLE_GROUP } = require('../constants/assignees');
const { getAuthorizedDriveClient } = require('../services/googleDriveOAuthService');
const {
  listSubfolders,
  parseFolderDate,
  ensurePrintingFolder,
} = require('../services/driveArchiveFolderService');
const {
  postVendorOpeningBalance,
  postVendorLedgerEntry,
  reverseAndDeleteTransaction,
} = require('../services/accountingPostingService');
const logger = require('../utils/logger');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PRINTING_PAYABLE_CACHE_MS = 60 * 1000;
let printingPayableCache = { key: '', expiresAt: 0, rows: [] };

function normalizePartyName(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrintingFolderName(name = '') {
  const raw = String(name || '').trim();
  const match = raw.match(/^(\d+)\s*(.*)$/);
  if (!match) {
    return { orderNumber: null, vendorName: '', customerName: '', raw };
  }

  const orderNumber = Number(match[1]);
  const tail = String(match[2] || '').replace(/^[\s_-]+/, '').trim();
  if (!tail) return { orderNumber, vendorName: '', customerName: '', raw };

  const separator = tail.match(/\s+-\s+/);
  if (!separator) {
    return { orderNumber, vendorName: tail, customerName: '', raw };
  }

  const splitAt = separator.index;
  const vendorName = tail.slice(0, splitAt).trim();
  const customerName = tail.slice(splitAt + separator[0].length).trim();
  return { orderNumber, vendorName, customerName, raw };
}

function dateKeyFromFolderName(name = '') {
  const match = String(name || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return '';
  return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
}

async function mapWithConcurrency(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      output[index] = await fn(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, () => worker());
  await Promise.all(workers);
  return output;
}

async function scanPrintingPayableFolders({ refresh = false } = {}) {
  const archiveFolderId = String(process.env.DRIVE_ARCHIVE_FOLDER_ID || '').trim();
  if (!archiveFolderId) {
    const err = new Error('DRIVE_ARCHIVE_FOLDER_ID not configured');
    err.statusCode = 400;
    throw err;
  }

  if (!refresh && printingPayableCache.key === archiveFolderId && printingPayableCache.expiresAt > Date.now()) {
    return printingPayableCache.rows;
  }

  const drive = await getAuthorizedDriveClient();
  const monthFolders = await listSubfolders(drive, archiveFolderId);

  const dateFolderGroups = await mapWithConcurrency(monthFolders, 5, async (month) => {
    const dateFolders = await listSubfolders(drive, month.id);
    return dateFolders
      .filter((folder) => parseFolderDate(folder.name))
      .map((folder) => ({
        ...folder,
        monthFolderId: month.id,
        monthFolderName: month.name,
        dateKey: dateKeyFromFolderName(folder.name),
      }));
  });

  const dateFolders = dateFolderGroups.flat().filter((folder) => folder.dateKey);
  const rowGroups = await mapWithConcurrency(dateFolders, 6, async (dateFolder) => {
    const printing = await ensurePrintingFolder(drive, dateFolder.id, { create: false });
    if (!printing) return [];

    const orderFolders = await listSubfolders(drive, printing.id);
    return orderFolders.map((folder) => ({
      folderId: folder.id,
      folderName: folder.name,
      date: dateFolder.dateKey,
      dateFolderId: dateFolder.id,
      dateFolderName: dateFolder.name,
      monthFolderId: dateFolder.monthFolderId,
      monthFolderName: dateFolder.monthFolderName,
      printingFolderId: printing.id,
      ...parsePrintingFolderName(folder.name),
    }));
  });

  const rawRows = rowGroups.flat();
  const orderNumbers = [...new Set(rawRows.map((row) => row.orderNumber).filter(Boolean))];
  const folderIds = rawRows.map((row) => row.folderId).filter(Boolean);

  const [orders, payableParties] = await Promise.all([
    orderNumbers.length
      ? Orders.find(
          { Order_Number: { $in: orderNumbers } },
          { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1 }
        ).lean()
      : [],
    Customers.find(
      { Status: 'active', Customer_group: ACCOUNT_PAYABLE_GROUP },
      {
        Customer_uuid: 1,
        Customer_name: 1,
        Mobile_number: 1,
        Tags: 1,
        Capabilities: 1,
      }
    ).lean(),
  ]);

  const payablePartyByUuidForJobs = new Map(
    payableParties.map((party) => [party.Customer_uuid, party])
  );
  const payablePartyByNameForJobs = new Map();
  payableParties.forEach((party) => {
    const key = normalizePartyName(party.Customer_name);
    if (key && !payablePartyByNameForJobs.has(key)) {
      payablePartyByNameForJobs.set(key, party);
    }
  });

  const orderUuids = [...new Set(orders.map((order) => order.Order_uuid).filter(Boolean))];
  const poLookupClauses = [];
  if (folderIds.length) poLookupClauses.push({ sourceDriveFolderId: { $in: folderIds } });
  if (orderUuids.length) poLookupClauses.push({ Order_uuid: { $in: orderUuids } });

  const sourcePos = poLookupClauses.length
    ? await PurchaseOrder.find(
        { $or: poLookupClauses },
        {
          PO_uuid: 1,
          PO_Number: 1,
          Order_uuid: 1,
          Vendor_uuid: 1,
          Vendor_name: 1,
          Items: 1,
          totalAmount: 1,
          extraCharges: 1,
          notes: 1,
          status: 1,
          poDate: 1,
          expectedDelivery: 1,
          sourceDriveFolderId: 1,
        }
      ).sort({ createdAt: -1 }).lean()
    : [];

  const postPressJobs = orderUuids.length
    ? await ProductionJob.find({
        job_category: 'post_printing',
        status: { $ne: 'cancelled' },
        $or: [
          { order_uuid: { $in: orderUuids } },
          { 'linkedOrders.orderUuid': { $in: orderUuids } },
        ],
      }).sort({ createdAt: 1 }).lean()
    : [];

  const postPressDocNumbers = postPressJobs
    .map((job) => job.job_number ? `PPJ-${job.job_number}` : '')
    .filter(Boolean);

  const postPressDocs = postPressDocNumbers.length
    ? await PublicInvoice.find(
        { docType: 'purchase_order', orderNumber: { $in: postPressDocNumbers } },
        { orderNumber: 1, shareToken: 1, cloudinaryUrl: 1 }
      ).lean()
    : [];
  const postPressDocByNumber = new Map(
    postPressDocs.map((doc) => [String(doc.orderNumber), doc])
  );

  const postPressJobsByOrder = new Map();
  postPressJobs.forEach((job) => {
    const jobOrders = new Set();
    if (job.order_uuid) jobOrders.add(job.order_uuid);
    (job.linkedOrders || []).forEach((link) => {
      if (link?.orderUuid) jobOrders.add(link.orderUuid);
    });

    const doc = job.job_number
      ? postPressDocByNumber.get(`PPJ-${job.job_number}`)
      : null;
    const payableParty =
      payablePartyByUuidForJobs.get(job.vendor_uuid)
      || payablePartyByNameForJobs.get(normalizePartyName(job.vendor_name))
      || null;
    const enriched = {
      ...job,
      payableVendorUuid: payableParty?.Customer_uuid || '',
      payableVendorName: payableParty?.Customer_name || job.vendor_name || '',
      documentGenerated: Boolean(doc),
      documentShareToken: doc?.shareToken || '',
      documentPdfUrl: doc?.cloudinaryUrl || '',
    };

    jobOrders.forEach((orderUuid) => {
      if (!postPressJobsByOrder.has(orderUuid)) postPressJobsByOrder.set(orderUuid, []);
      postPressJobsByOrder.get(orderUuid).push(enriched);
    });
  });

  const orderByNumber = new Map(orders.map((order) => [Number(order.Order_Number), order]));
  const partyByUuid = new Map(payableParties.map((party) => [party.Customer_uuid, party]));
  const partyByName = new Map();
  payableParties.forEach((party) => {
    const key = normalizePartyName(party.Customer_name);
    if (key && !partyByName.has(key)) partyByName.set(key, party);
  });
  const poByFolder = new Map(
    sourcePos
      .filter((po) => po.sourceDriveFolderId)
      .map((po) => [po.sourceDriveFolderId, po])
  );
  const poByOrderVendor = new Map();
  sourcePos.forEach((po) => {
    if (po.sourceDriveFolderId || !po.Order_uuid || !po.Vendor_uuid || po.status === 'cancelled') return;
    const key = `${po.Order_uuid}|${po.Vendor_uuid}`;
    if (!poByOrderVendor.has(key)) poByOrderVendor.set(key, []);
    poByOrderVendor.get(key).push(po);
  });

  const orderCustomerIds = [...new Set(orders.map((order) => order.Customer_uuid).filter(Boolean))];
  const orderCustomers = orderCustomerIds.length
    ? await Customers.find(
        { Customer_uuid: { $in: orderCustomerIds } },
        { Customer_uuid: 1, Customer_name: 1 }
      ).lean()
    : [];
  const customerNameByUuid = new Map(orderCustomers.map((customer) => [customer.Customer_uuid, customer.Customer_name]));

  const rows = rawRows.map((row) => {
    const order = row.orderNumber ? orderByNumber.get(Number(row.orderNumber)) : null;
    const parsedParty = row.vendorName ? partyByName.get(normalizePartyName(row.vendorName)) : null;
    const exactSourcePo = poByFolder.get(row.folderId) || null;
    const legacyCandidates = order?.Order_uuid && parsedParty?.Customer_uuid
      ? (poByOrderVendor.get(`${order.Order_uuid}|${parsedParty.Customer_uuid}`) || [])
      : [];
    const savedPo = exactSourcePo || (legacyCandidates.length === 1 ? legacyCandidates[0] : null);
    const savedParty = savedPo?.Vendor_uuid ? partyByUuid.get(savedPo.Vendor_uuid) : null;
    const party = savedParty || parsedParty || null;
    const extras = (savedPo?.extraCharges || []).reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
    const invoiceValue = Number(savedPo?.totalAmount || 0) + extras;
    const postPressJobsForOrder = order?.Order_uuid
      ? (postPressJobsByOrder.get(order.Order_uuid) || [])
      : [];
    const postPressTotal = postPressJobsForOrder.reduce(
      (sum, job) => sum + Number(job.jobValue || 0),
      0
    );
    const postPressCompleted = postPressJobsForOrder.filter(
      (job) => job.status === 'completed'
    ).length;

    return {
      ...row,
      orderUuid: order?.Order_uuid || savedPo?.Order_uuid || '',
      vendorUuid: party?.Customer_uuid || savedPo?.Vendor_uuid || '',
      vendorName: party?.Customer_name || savedPo?.Vendor_name || row.vendorName || '',
      parsedVendorName: row.vendorName || '',
      customerName: row.customerName || (order?.Customer_uuid ? customerNameByUuid.get(order.Customer_uuid) : '') || '',
      vendorMatched: Boolean(party?.Customer_uuid || savedPo?.Vendor_uuid),
      partyTags: party?.Tags || [],
      partyCapabilities: party?.Capabilities || [],
      poUuid: savedPo?.PO_uuid || '',
      poNumber: savedPo?.PO_Number || null,
      poStatus: savedPo?.status || '',
      poDate: savedPo?.poDate || null,
      expectedDelivery: savedPo?.expectedDelivery || null,
      poItems: Array.isArray(savedPo?.Items) ? savedPo.Items : [],
      extraCharges: Array.isArray(savedPo?.extraCharges) ? savedPo.extraCharges : [],
      notes: savedPo?.notes || '',
      invoiceValue,
      postPressJobs: postPressJobsForOrder,
      postPressTotal,
      postPressCount: postPressJobsForOrder.length,
      postPressCompleted,
      driveFolderUrl: `https://drive.google.com/drive/folders/${row.folderId}`,
    };
  });

  rows.sort((a, b) => String(b.date).localeCompare(String(a.date))
    || Number(b.orderNumber || 0) - Number(a.orderNumber || 0));

  printingPayableCache = {
    key: archiveFolderId,
    expiresAt: Date.now() + PRINTING_PAYABLE_CACHE_MS,
    rows,
  };
  return rows;
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
    In_house: Boolean(vendorPayload.in_house),
  });

  if (created.Opening_balance > 0 && created.Opening_balance_type !== 'none') {
    let posting = null;
    try {
      posting = await postVendorOpeningBalance({
        amount: created.Opening_balance,
        balanceType: created.Opening_balance_type,
        vendorUuid: created.Vendor_uuid,
        partyName: created.Vendor_name,
        createdBy: vendorPayload.created_by || vendorPayload.createdBy || 'system',
        sourceSuffix: `vendor:${created.Vendor_uuid}`,
      });

      await VendorLedger.create({
        vendor_uuid: created.Vendor_uuid,
        vendor_name: created.Vendor_name,
        entry_type: 'opening',
        amount: created.Opening_balance,
        dr_cr: created.Opening_balance_type === 'advance' ? 'dr' : 'cr',
        narration: 'Opening balance',
        transaction_uuid: posting?.transaction?.Transaction_uuid || '',
        reference_type: 'vendor_opening',
        reference_id: created.Vendor_uuid,
      });
    } catch (error) {
      // Do not leave a vendor with an opening balance that never reached the
      // unified ledger. Roll the just-created master and posting back.
      if (posting?.transaction?.Transaction_uuid && !posting.existing) {
        await reverseAndDeleteTransaction({ Transaction_uuid: posting.transaction.Transaction_uuid }).catch(() => {});
      }
      await VendorMaster.deleteOne({ _id: created._id }).catch(() => {});
      throw error;
    }
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

// GET /api/vendors/payable-parties
// The money-out side of the party list: active Customers in the admin-kept
// "Account Payable" group (vendors, freelancers, contractors, and any
// in-house account registered the same way). This is what vendor pickers
// show — vendor_masters is auto-populated and not safe to pick from.
router.get('/payable-parties', async (_req, res) => {
  try {
    const parties = await Customers.find(
      { Status: 'active', Customer_group: ACCOUNT_PAYABLE_GROUP },
      {
        Customer_uuid: 1,
        Customer_name: 1,
        Mobile_number: 1,
        Customer_group: 1,
        Tags: 1,
        PartyRoles: 1,
        Capabilities: 1,
        Opening_balance: 1,
        Opening_balance_type: 1,
      }
    ).sort({ Customer_name: 1 }).lean();

    res.json({
      success: true,
      result: parties.map((c) => ({
        Vendor_uuid: c.Customer_uuid,
        Vendor_name: c.Customer_name,
        Mobile_number: c.Mobile_number || '',
        Customer_group: c.Customer_group || 'Account Payable',
        Tags: Array.isArray(c.Tags) ? c.Tags : [],
        PartyRoles: Array.isArray(c.PartyRoles) ? c.PartyRoles : [],
        Capabilities: Array.isArray(c.Capabilities) ? c.Capabilities : [],
        Opening_balance: Number(c.Opening_balance || 0),
        Opening_balance_type: c.Opening_balance_type || 'debit',
      })),
    });
  } catch (error) {
    logger.error('Failed to list payable parties', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/vendors/printing-payables
// Reads the Drive archive tree:
//   <archive>/04 April 2026/01.04.2026/Printing/793 Vendor - Customer
// and enriches each folder with the matching MIS order, Account Payable party,
// and any invoice/PO already saved for that Drive folder.
router.get('/printing-payables', requirePermission('canViewAccounts'), async (req, res) => {
  try {
    const requestedDate = String(req.query.date || '').trim();
    const refresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const allRows = await scanPrintingPayableFolders({ refresh });

    const datesMap = {};
    allRows.forEach((row) => {
      if (row.date) datesMap[row.date] = (datesMap[row.date] || 0) + 1;
    });
    const dates = Object.entries(datesMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const rows = requestedDate
      ? allRows.filter((row) => row.date === requestedDate)
      : allRows;

    return res.json({
      success: true,
      result: rows,
      dates,
      total: allRows.length,
      unmatched: allRows.filter((row) => !row.vendorMatched).length,
    });
  } catch (error) {
    logger.error('Failed to scan Drive Printing payables', error);
    if (error?.reconnectRequired) {
      return res.status(401).json({
        success: false,
        message: 'Google Drive disconnected. Please reconnect.',
        reconnectRequired: true,
      });
    }
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Could not load Printing folders',
    });
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
          In_house: Boolean(req.body.in_house),
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
  let posting = null;
  try {
    const vendor = await ensureVendorMaster({
      vendor_uuid: req.body.vendor_uuid,
      vendor_name: req.body.vendor_name || req.body.vendorName,
    });

    const amount = toNumber(req.body.amount, 0);
    const entryType = String(req.body.entry_type || '').trim();
    const drCr = String(req.body.dr_cr || '').trim().toLowerCase();
    if (!(amount > 0)) {
      return res.status(400).json({ success: false, message: 'A positive amount is required' });
    }
    if (!entryType || !['dr', 'cr'].includes(drCr)) {
      return res.status(400).json({ success: false, message: 'entry_type and dr_cr (dr/cr) are required' });
    }

    const entryUuid = uuid();
    const referenceType = String(req.body.reference_type || '').trim();
    const referenceId = String(req.body.reference_id || '').trim();
    let transactionUuid = String(req.body.transaction_uuid || '').trim();

    if (transactionUuid) {
      const existingTxn = await Transaction.findOne({ Transaction_uuid: transactionUuid }).lean();
      if (!existingTxn) {
        return res.status(400).json({ success: false, message: 'transaction_uuid does not reference an existing transaction' });
      }
    } else {
      const sourceSuffix = referenceType && referenceId
        ? `${referenceType}:${referenceId}`
        : `manual:${entryUuid}`;

      posting = await postVendorLedgerEntry({
        entryType,
        drCr,
        amount,
        paymentMode: req.body.payment_mode || req.body.paymentMode || 'Cash',
        orderUuid: req.body.order_uuid || null,
        orderNumber: req.body.order_number || null,
        createdBy: req.user?.userName || req.user?.name || 'system',
        transactionDate: req.body.date || new Date(),
        narration: String(req.body.narration || ''),
        reference: req.body.reference || '',
        sourceSuffix,
      });
      transactionUuid = posting?.transaction?.Transaction_uuid || '';
    }

    if (!transactionUuid) {
      throw new Error('Unified accounting transaction was not created');
    }

    const ledgerDoc = {
      entry_uuid: entryUuid,
      vendor_uuid: vendor.Vendor_uuid,
      vendor_name: vendor.Vendor_name,
      date: req.body.date || new Date(),
      entry_type: entryType,
      job_uuid: req.body.job_uuid || '',
      order_uuid: req.body.order_uuid || '',
      order_number: req.body.order_number || null,
      amount,
      dr_cr: drCr,
      narration: String(req.body.narration || ''),
      transaction_uuid: transactionUuid,
      reference_type: referenceType,
      reference_id: referenceId,
    };

    const created = referenceType && referenceId
      ? await VendorLedger.findOneAndUpdate(
          { vendor_uuid: vendor.Vendor_uuid, reference_type: referenceType, reference_id: referenceId },
          { $set: ledgerDoc },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        )
      : await VendorLedger.create(ledgerDoc);

    return res.json({ success: true, result: created });
  } catch (error) {
    if (posting?.transaction?.Transaction_uuid && !posting.existing) {
      await reverseAndDeleteTransaction({ Transaction_uuid: posting.transaction.Transaction_uuid }).catch(() => {});
    }
    logger.error('Failed to create vendor ledger entry', error);
    res.status(error?.statusCode || 500).json({ success: false, message: error.message });
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
    const valid = ['draft', 'sent', 'in_progress', 'completed', 'cancelled'];
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
      jobUuid: req.body.job_uuid || req.body.jobUuid,
      jobType: req.body.job_type,
      jobMode: req.body.job_mode || 'jobwork_only',
      payableAccount: req.body.payable_account || req.body.payableAccount || '',
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
      driveFileId: String(req.body.driveFileId || req.body.drive_file_id || ''),
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
