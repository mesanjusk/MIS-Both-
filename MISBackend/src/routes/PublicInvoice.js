const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const PublicInvoice = require('../repositories/publicInvoice');
const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const { AppSetting } = require('../repositories/appSetting');

// Business profile snapshot stored on every shared document, so a link keeps
// showing the letterhead that was in force when it was sent.
async function loadProfileSnapshot() {
  const profile = (await AppSetting.getSetting('business_profile', {})) || {};
  return {
    storeName:    profile.name || 'S.K. Digital',
    addressLines: [profile.addressLine1, profile.addressLine2, profile.city].filter(Boolean),
    phone:   profile.phone   || '',
    email:   profile.email   || '',
    gst:     profile.gst     || '',
    upiId:   profile.upiId   || '',
    upiName: profile.upiName || '',
  };
}

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
router.post('/migrate', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Fetch business profile snapshot
    const { storeName, addressLines, phone, email, gst, upiId, upiName } = await loadProfileSnapshot();

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
      (await PublicInvoice.find({ docType: { $ne: 'receipt' } }, { orderNumber: 1 }).lean())
        .map((d) => String(d.orderNumber))
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
        docType:       'invoice',
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

    // Upsert: if same order number re-saved, update rather than duplicate.
    // docType is $ne-matched so legacy docs (saved before docType existed) still match.
    const filter = orderNumber ? { orderNumber: String(orderNumber), docType: { $ne: 'receipt' } } : null;
    let doc;
    if (filter) {
      doc = await PublicInvoice.findOneAndUpdate(
        filter,
        { docType: 'invoice',
          orderNumber, partyName, dateStr, storeName, addressLines, phone, email, gst, upiId, upiName,
          items: items || [], extraCharges: extraCharges || [], grandTotal: grandTotal || 0,
          ...(cloudinaryUrl ? { cloudinaryUrl } : {}),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } else {
      doc = await PublicInvoice.create({
        docType: 'invoice',
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

// Look up the shared sale invoice for an order number (authenticated)
router.get('/by-order/:orderNumber', requireAuth, async (req, res) => {
  try {
    const doc = await PublicInvoice.findOne({
      orderNumber: String(req.params.orderNumber),
      docType: { $ne: 'receipt' },
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Invoice not found for this order' });
    res.json({ success: true, result: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Look up the shared voucher for a ledger transaction (authenticated)
router.get('/by-transaction/:transactionUuid', requireAuth, async (req, res) => {
  try {
    const doc = await PublicInvoice.findOne({
      transactionUuid: String(req.params.transactionUuid),
      docType: 'receipt',
    }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Voucher not found for this transaction' });
    res.json({ success: true, result: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create (or refresh) the shareable voucher for a receipt / payment transaction.
// Idempotent per transaction so the same link keeps working after a re-open.
router.post('/receipt', requireAuth, async (req, res) => {
  try {
    const {
      transactionUuid, transactionId, orderNumber,
      partyName, dateStr, amount, paymentMode, narration, voucherType,
    } = req.body;

    if (!transactionUuid) {
      return res.status(400).json({ success: false, message: 'transactionUuid is required' });
    }

    const profile = await loadProfileSnapshot();
    const doc = await PublicInvoice.findOneAndUpdate(
      { transactionUuid: String(transactionUuid), docType: 'receipt' },
      {
        docType: 'receipt',
        voucherType: ['receipt', 'payment', 'journal'].includes(voucherType) ? voucherType : 'receipt',
        transactionUuid: String(transactionUuid),
        transactionId:   transactionId != null ? String(transactionId) : '',
        orderNumber:     orderNumber != null ? String(orderNumber) : '',
        partyName:       partyName || '',
        dateStr:         dateStr || new Date().toLocaleDateString('en-GB'),
        amount:          Number(amount) || 0,
        grandTotal:      Number(amount) || 0,
        paymentMode:     paymentMode || '',
        narration:       narration || '',
        items: [],
        extraCharges: [],
        ...profile,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, result: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create (or refresh) the shareable account statement for one party and period.
// Idempotent per party + period so re-sharing the same range keeps one link.
const MAX_STATEMENT_ROWS = 2000;

router.post('/statement', requireAuth, async (req, res) => {
  try {
    const {
      partyUuid, partyName, periodFrom, periodTo, generatedOn,
      openingBalance, totalDebit, totalCredit, closingBalance, rows,
    } = req.body;

    if (!partyUuid && !partyName) {
      return res.status(400).json({ success: false, message: 'partyUuid or partyName is required' });
    }
    if (!Array.isArray(rows)) {
      return res.status(400).json({ success: false, message: 'rows must be an array' });
    }
    if (rows.length > MAX_STATEMENT_ROWS) {
      return res.status(400).json({
        success: false,
        message: `A statement can hold at most ${MAX_STATEMENT_ROWS} rows — narrow the date range.`,
      });
    }

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const cleanRows = rows.map((r) => ({
      txnNo:       r?.txnNo ?? '',
      voucherNo:   String(r?.voucherNo || ''),
      voucherType: String(r?.voucherType || ''),
      dateStr:     String(r?.dateStr || ''),
      particulars: String(r?.particulars || ''),
      description: String(r?.description || ''),
      debit:       num(r?.debit),
      credit:      num(r?.credit),
      balance:     num(r?.balance),
    }));

    const profile = await loadProfileSnapshot();
    const doc = await PublicInvoice.findOneAndUpdate(
      {
        docType: 'statement',
        partyUuid: String(partyUuid || ''),
        periodFrom: String(periodFrom || ''),
        periodTo: String(periodTo || ''),
      },
      {
        docType: 'statement',
        partyUuid:  String(partyUuid || ''),
        partyName:  partyName || '',
        periodFrom: String(periodFrom || ''),
        periodTo:   String(periodTo || ''),
        generatedOn: generatedOn || new Date().toLocaleDateString('en-GB'),
        dateStr:     generatedOn || new Date().toLocaleDateString('en-GB'),
        openingBalance: num(openingBalance),
        totalDebit:     num(totalDebit),
        totalCredit:    num(totalCredit),
        closingBalance: num(closingBalance),
        grandTotal:     num(closingBalance),
        amount:         num(closingBalance),
        rows: cleanRows,
        items: [],
        extraCharges: [],
        // A statement is a point-in-time view: refresh the letterhead and the
        // expiry every time it is re-shared.
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        ...profile,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, result: doc });
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
