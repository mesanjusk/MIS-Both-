const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const PublicInvoice = require('../repositories/publicInvoice');

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

// Save invoice and return shareToken (authenticated)
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      orderNumber, partyName, dateStr,
      storeName, addressLines, phone, email, gst, upiId, upiName,
      items, extraCharges, grandTotal, cloudinaryUrl,
    } = req.body;

    const doc = await PublicInvoice.create({
      orderNumber, partyName, dateStr,
      storeName, addressLines, phone, email, gst, upiId, upiName,
      items: items || [],
      extraCharges: extraCharges || [],
      grandTotal: grandTotal || 0,
      cloudinaryUrl: cloudinaryUrl || '',
    });

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
