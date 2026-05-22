const { requireAuth } = require('../middleware/auth');
const express = require('express');
const router  = express.Router();
const Counter  = require('../repositories/counter');
const PurchaseOrder = require('../repositories/purchaseOrder');
const VendorMaster  = require('../repositories/vendorMaster');
const logger = require('../utils/logger');
const { postPurchase } = require('../services/accountingPostingService');

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
      const qty  = toNumber(item.qty,  0);
      const rate = toNumber(item.rate, 0);
      return {
        itemName: String(item.itemName || item.Item || '').trim(),
        qty,
        unit:   String(item.unit || 'Nos').trim() || 'Nos',
        rate,
        amount: toNumber(item.amount, qty * rate),
      };
    })
    .filter((item) => item.itemName);
}

function calcPoTotal(items = []) {
  return items.reduce((sum, item) => sum + toNumber(item.amount, 0), 0);
}

router.use(requireAuth);

// POST /api/purchase-order/create
router.post('/create', async (req, res) => {
  try {
    const vendorUuid = String(req.body.Vendor_uuid || req.body.vendorUuid || '').trim();
    if (!vendorUuid) return res.status(400).json({ success: false, message: 'Vendor is required' });

    const vendor = await VendorMaster.findOne({ Vendor_uuid: vendorUuid }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const items    = normalizeItems(req.body.Items || req.body.items || []);
    const poTotal  = calcPoTotal(items);

    const po = await PurchaseOrder.create({
      PO_Number:        await nextPoNumber(),
      Order_uuid:       String(req.body.Order_uuid  || req.body.orderUuid || ''),
      Vendor_uuid:      vendor.Vendor_uuid,
      Vendor_name:      vendor.Vendor_name,
      Items:            items,
      totalAmount:      poTotal,
      status:           ['draft', 'sent', 'received', 'cancelled'].includes(
                          String(req.body.status || '').toLowerCase()
                        ) ? String(req.body.status).toLowerCase() : 'draft',
      expectedDelivery: req.body.expectedDelivery || null,
      notes:            String(req.body.notes || ''),
      createdBy:        String(req.body.createdBy || req.user?.userName || ''),
    });

    res.status(201).json({ success: true, result: po });
  } catch (error) {
    logger.error('Create PO failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/purchase-order/list
router.get('/list', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status)   filter.status     = String(req.query.status).toLowerCase();
    if (req.query.vendorId) filter.Vendor_uuid = String(req.query.vendorId);
    if (req.query.fromDate || req.query.toDate) {
      filter.createdAt = {};
      if (req.query.fromDate) filter.createdAt.$gte = new Date(req.query.fromDate);
      if (req.query.toDate)   {
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

// GET /api/purchase-order/:id
router.get('/:id', async (req, res) => {
  try {
    const po = await PurchaseOrder.findOne(buildPoLookup(req.params.id)).lean();
    if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
    res.json({ success: true, result: po });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/purchaseorder/:id  — update items, notes, status
router.put('/:id', async (req, res) => {
  try {
    const po = await PurchaseOrder.findOne(buildPoLookup(req.params.id));
    if (!po) return res.status(404).json({ success: false, message: 'PO not found' });

    if (Array.isArray(req.body.Items)) po.Items = normalizeItems(req.body.Items);
    if (typeof req.body.notes !== 'undefined') po.notes = String(req.body.notes || '');
    if (req.body.expectedDelivery) po.expectedDelivery = new Date(req.body.expectedDelivery);
    if (req.body.status && ['draft', 'sent', 'received', 'cancelled'].includes(req.body.status)) {
      po.status = req.body.status;
    }

    const saved = await po.save();
    res.json({ success: true, result: saved });
  } catch (error) {
    logger.error('PO update failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/purchaseorder/:id/status
// When status changes to 'received', posts a centralized Purchase accounting entry
// so the PO flow is fully represented in the unified transaction system.
router.put('/:id/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['draft', 'sent', 'received', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const po = await PurchaseOrder.findOne(buildPoLookup(req.params.id)).lean();
    if (!po) return res.status(404).json({ success: false, message: 'PO not found' });

    const patch = { status };
    if (status === 'received') {
      patch.receivedDate = req.body.receivedDate || new Date();

      // Post Purchase accounting entry only once (idempotent via allowDuplicate:false)
      const poTotal = po.totalAmount ||
        (Array.isArray(po.Items) ? calcPoTotal(po.Items) : 0);

      if (poTotal > 0) {
        try {
          await postPurchase({
            amount:          poTotal,
            purchaseAccount: 'Purchase',
            orderUuid:       po.Order_uuid || '',
            createdBy:       req.body.createdBy || req.user?.userName || 'system',
            description:     `PO #${po.PO_Number} received from ${po.Vendor_name}`,
            sourceSuffix:    po.PO_uuid,
            allowDuplicate:  false,
          });
        } catch (postErr) {
          // Log but don't block the status update — accounting can be retried
          logger.error(`postPurchase failed for PO ${po.PO_uuid}: ${postErr.message}`);
        }
      }
    }

    const updated = await PurchaseOrder.findOneAndUpdate(
      buildPoLookup(req.params.id),
      { $set: patch },
      { new: true }
    );
    res.json({ success: true, result: updated });
  } catch (error) {
    logger.error('PO status update failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
