const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const PublicInvoice = require('../repositories/publicInvoice');
const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const { AppSetting } = require('../repositories/appSetting');

// List all invoices (authenticated, paginated)
router.get('/', requireAuth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const search = req.query.search ? String(req.query.search).trim() : '';

    const filter = search
      ? {
          $or: [
            { orderNumber: { $regex: search, $options: 'i' } },
            { partyName:   { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const [total, docs] = await Promise.all([
      PublicInvoice.countDocuments(filter),
      PublicInvoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({ success: true, result: docs, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// One-time migration: create public_invoices for all existing orders that have billable items
router.post('/migrate', requireAuth, async (req, res) => {
  try {
    // Fetch business profile snapshot
    const profile = (await AppSetting.getSetting('business_profile', {})) || {};
    const storeName    = profile.name        || 'S.K. Digital';
    const addressLines = [profile.addressLine1, profile.addressLine2, profile.city].filter(Boolean);
    const phone   = profile.phone   || '';
    const email   = profile.email   || '';
    const gst     = profile.gst     || '';
    const upiId   = profile.upiId   || '';
    const upiName = profile.upiName || '';

    // Find orders that have at least one item with Amount > 0 (invoiced orders)
    const orders = await Orders.find({
      'Items.0': { $exists: true },
      Items: { $elemMatch: { Amount: { $gt: 0 } } },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!orders.length) {
      return res.json({ success: true, result: { migrated: 0, skipped: 0, total: 0 } });
    }

    // Build customer map for name lookup
    const uuids = [...new Set(orders.map((o) => o.Customer_uuid).filter(Boolean))];
    const customers = await Customers.find({ Customer_uuid: { $in: uuids } })
      .select('Customer_uuid Customer_name Mobile_number')
      .lean();
    const customerMap = {};
    for (const c of customers) customerMap[c.Customer_uuid] = c;

    // Get already-migrated order numbers to avoid duplicates
    const existingNums = new Set(
      (await PublicInvoice.find({}, { orderNumber: 1 }).lean()).map((d) => String(d.orderNumber))
    );

    let migrated = 0;
    let skipped  = 0;
    const BATCH = 50;
    const docs   = [];

    for (const order of orders) {
      const num = String(order.Order_Number || '');
      if (existingNums.has(num)) { skipped++; continue; }

      const cust   = customerMap[order.Customer_uuid] || {};
      const items  = (order.Items || []).filter((i) => Number(i.Amount) > 0).map((i) => ({
        Item:     i.Item     || '',
        Quantity: i.Quantity || 0,
        Rate:     i.Rate     || 0,
        Amount:   i.Amount   || 0,
        Remark:   i.Remark   || '',
      }));
      const grandTotal = items.reduce((s, i) => s + Number(i.Amount), 0);
      const dateStr = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString('en-GB')
        : new Date().toLocaleDateString('en-GB');

      docs.push({
        orderNumber:   num,
        partyName:     cust.Customer_name || order.Customer_uuid || 'Customer',
        dateStr,
        storeName, addressLines, phone, email, gst, upiId, upiName,
        items,
        extraCharges:  Array.isArray(order.extraCharges) ? order.extraCharges : [],
        grandTotal,
        cloudinaryUrl: '',
      });

      migrated++;

      // Insert in batches
      if (docs.length >= BATCH) {
        await PublicInvoice.insertMany(docs.splice(0, BATCH), { ordered: false });
      }
    }

    if (docs.length) {
      await PublicInvoice.insertMany(docs, { ordered: false });
    }

    res.json({ success: true, result: { migrated, skipped, total: orders.length } });
  } catch (err) {
    console.error('Invoice migration error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Save invoice and return shareToken (authenticated)
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      orderNumber, partyName, dateStr,
      storeName, addressLines, phone, email, gst, upiId, upiName,
      items, extraCharges, grandTotal, cloudinaryUrl,
    } = req.body;

    // Upsert: if same order number re-saved, update rather than duplicate
    const filter = orderNumber ? { orderNumber: String(orderNumber) } : null;
    let doc;
    if (filter) {
      doc = await PublicInvoice.findOneAndUpdate(
        filter,
        { orderNumber, partyName, dateStr, storeName, addressLines, phone, email, gst, upiId, upiName,
          items: items || [], extraCharges: extraCharges || [], grandTotal: grandTotal || 0,
          ...(cloudinaryUrl ? { cloudinaryUrl } : {}),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } else {
      doc = await PublicInvoice.create({
        orderNumber, partyName, dateStr, storeName, addressLines, phone, email, gst, upiId, upiName,
        items: items || [], extraCharges: extraCharges || [], grandTotal: grandTotal || 0,
        cloudinaryUrl: cloudinaryUrl || '',
      });
    }

    res.json({ success: true, result: { shareToken: doc.shareToken } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update cloudinaryUrl after PDF upload (authenticated)
router.patch('/:shareToken/pdf', requireAuth, async (req, res) => {
  try {
    const { cloudinaryUrl } = req.body;
    await PublicInvoice.findOneAndUpdate(
      { shareToken: req.params.shareToken },
      { $set: { cloudinaryUrl } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public read — no auth
router.get('/p/:shareToken', async (req, res) => {
  try {
    const doc = await PublicInvoice.findOne({ shareToken: req.params.shareToken }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, result: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
