const { requireAuth } = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const Counter = require('../repositories/counter');
const PurchaseOrder = require('../repositories/purchaseOrder');
const VendorMaster = require('../repositories/vendorMaster');
const logger = require('../utils/logger');

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function nextPoNumber() {
  const counter = await Counter.findByIdAndUpdate(
    'purchase_order_number',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(counter?.seq || 1);
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const qty = toNumber(item.qty, 0);
      const rate = toNumber(item.rate, 0);
      return {
        itemName: String(item.itemName || item.Item || '').trim(),
        qty,
        unit: String(item.unit || 'Nos').trim() || 'Nos',
        rate,
        amount: toNumber(item.amount, qty * rate),
      };
    })
    .filter((item) => item.itemName);
}

router.use(requireAuth);

router.post('/create', async (req, res) => {
  try {
    const vendorUuid = String(req.body.Vendor_uuid || req.body.vendorUuid || '').trim();
    if (!vendorUuid) return res.status(400).json({ success: false, message: 'Vendor is required' });

    const vendor = await VendorMaster.findOne({ Vendor_uuid: vendorUuid }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const po = await PurchaseOrder.create({
      PO_Number: await nextPoNumber(),
      Order_uuid: String(req.body.Order_uuid || req.body.orderUuid || ''),
      Vendor_uuid: vendor.Vendor_uuid,
      Vendor_name: vendor.Vendor_name,
      Items: normalizeItems(req.body.Items || req.body.items || []),
      status: ['draft', 'sent', 'received', 'cancelled'].includes(String(req.body.status || '').toLowerCase())
        ? String(req.body.status).toLowerCase()
        : 'draft',
      expectedDelivery: req.body.expectedDelivery || null,
      notes: String(req.body.notes || ''),
      createdBy: String(req.body.createdBy || req.user?.userName || ''),
    });

    res.status(201).json({ success: true, result: po });
  } catch (error) {
    logger.error('Create PO failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status).toLowerCase();
    if (req.query.vendorId) filter.Vendor_uuid = String(req.query.vendorId);
    if (req.query.fromDate || req.query.toDate) {
      filter.createdAt = {};
      if (req.query.fromDate) filter.createdAt.$gte = new Date(req.query.fromDate);
      if (req.query.toDate) {
        const end = new Date(req.query.toDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    const rows = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, result: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const buildPoLookup = (id) => {
  const raw = String(id || '').trim();
  const clauses = [{ PO_uuid: raw }];
  if (/^[a-f\d]{24}$/i.test(raw)) clauses.push({ _id: raw });
  return { $or: clauses };
};

router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const po = await PurchaseOrder.findOne(buildPoLookup(id)).lean();
    if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
    res.json({ success: true, result: po });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['draft', 'sent', 'received', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const patch = { status };
    if (status === 'received') patch.receivedDate = req.body.receivedDate || new Date();
    const updated = await PurchaseOrder.findOneAndUpdate(
      buildPoLookup(req.params.id),
      { $set: patch },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'PO not found' });
    res.json({ success: true, result: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
