const { requireAuth, requireInternalKey } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const express = require('express');
const { v4: uuid } = require('uuid');
const PaymentFollowup = require('../repositories/paymentFollowup');
const Customers = require('../repositories/customer');
const sanjusk = require('../services/sanjuskApiService');
const {
  FOLLOWUP_FRIENDLY_TEMPLATE,
  FOLLOWUP_DUE_TODAY_TEMPLATE,
} = require('../config/whatsappTemplates');
const {
  getReceivableBalances,
  enrichFollowups,
  indiaDay,
  money,
} = require('../services/paymentFollowupLedgerService');
const logger = require('../utils/logger');

const router = express.Router();
const norm = (value) => String(value ?? '').trim();
const REMINDER_COOLDOWN_MS = 48 * 60 * 60 * 1000;
const REMINDER_LOCK_MS = 5 * 60 * 1000;

const parseDate = (input, fallback = new Date()) => {
  if (!input) return fallback;
  const value = norm(input);
  // Interpret a date-only input as the customer's India calendar day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T12:00:00+05:30')
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const userLabel = (req) => norm(req.user?.userName || req.user?.User_name || req.user?.name || req.user?.id || 'staff');
const historyEvent = (req, action, note = '') => ({
  at: new Date(), by: userLabel(req), action, note: norm(note).slice(0, 500),
});
const phoneNumber = (value) => {
  const digits = norm(value).replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : '';
};
const asDateLabel = (value) => new Date(value).toLocaleDateString('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
});

router.use(requireAuth);
router.use(requirePermission('canViewAccounts'));

// GET /api/paymentfollowup/balance/:customerUuid
// Same UUID-ledger accounting convention used by Home > Outstanding.
router.get('/balance/:customerUuid', async (req, res) => {
  try {
    const customer = await Customers.findOne(
      { Customer_uuid: norm(req.params.customerUuid) },
      { Customer_uuid: 1, Customer_name: 1, Mobile_number: 1 },
    ).lean();
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    const balances = await getReceivableBalances([customer.Customer_uuid]);
    return res.json({
      success: true,
      result: { customer_uuid: customer.Customer_uuid, customer_name: customer.Customer_name,
        outstanding: Math.max(0, balances.get(String(customer.Customer_uuid)) ?? 0) },
    });
  } catch (error) {
    logger.error({ err: error.message }, 'Follow-up balance lookup failed');
    return res.status(500).json({ success: false, message: 'Unable to load customer outstanding' });
  }
});

// Existing creation route retained for the legacy /accounts/followups form.
router.post('/add', async (req, res) => {
  try {
    const name = norm(req.body.Customer);
    const customerUuid = norm(req.body.Customer_uuid || req.body.customer_uuid);
    const amount = money(req.body.Amount);
    const followupDate = parseDate(req.body.Followup_date);
    const promisedDate = req.body.Promised_date ? parseDate(req.body.Promised_date) : null;
    if ((!name && !customerUuid) || !Number.isFinite(Number(req.body.Amount)) || amount <= 0 || !followupDate ||
        (req.body.Promised_date && !promisedDate)) {
      return res.status(400).json({ success: false, message: 'Valid customer, positive amount and dates required' });
    }

    let customer = null;
    if (customerUuid) {
      customer = await Customers.findOne({ Customer_uuid: customerUuid },
        { Customer_uuid: 1, Customer_name: 1, Mobile_number: 1 }).lean();
      if (!customer) return res.status(400).json({ success: false, message: 'Select an existing customer' });
    } else if (name) {
      // A legacy name is attached to a UUID only when unambiguous.
      const matches = await Customers.find({ Customer_name: name },
        { Customer_uuid: 1, Customer_name: 1, Mobile_number: 1 }).limit(2).lean();
      if (matches.length === 1) customer = matches[0];
    }

    const canonicalName = customer?.Customer_name || name;
    const resolvedUuid = customer?.Customer_uuid || '';
    let baseline = 0;
    if (resolvedUuid) {
      const balances = await getReceivableBalances([resolvedUuid]);
      baseline = Math.max(0, balances.get(String(resolvedUuid)) ?? 0);
      if (baseline <= 0) {
        return res.status(409).json({ success: false, message: 'Customer has no current receivable in the ledger' });
      }
      if (amount > baseline + 0.01) {
        return res.status(400).json({ success: false, message: 'Follow-up cannot exceed current ledger outstanding' });
      }
    }

    const dateKey = indiaDay(followupDate);
    const from = new Date(dateKey + 'T00:00:00+05:30');
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const duplicates = [{ customer_name: canonicalName }];
    if (resolvedUuid) duplicates.push({ customer_uuid: resolvedUuid });
    const exists = await PaymentFollowup.findOne({
      $or: duplicates, amount, status: 'pending', followup_date: { $gte: from, $lt: to },
    }).lean();
    if (exists) return res.status(409).json({
      success: false, message: 'An open follow-up already exists for this customer, date and amount',
    });

    const doc = await PaymentFollowup.create({
      followup_uuid: uuid(), customer_name: canonicalName, customer_uuid: resolvedUuid,
      baseline_outstanding: baseline, amount,
      title: norm(req.body.Title).slice(0, 200), remark: norm(req.body.Remark).slice(0, 1000),
      assigned_to: norm(req.body.Assigned_to).slice(0, 120),
      promised_date: promisedDate, followup_date: followupDate, status: 'pending',
      created_by: userLabel(req),
      history: [historyEvent(req, 'created', 'Follow-up created')],
    });
    return res.status(201).json({ success: true, result: doc });
  } catch (error) {
    logger.error({ err: error.message }, 'Create payment follow-up failed');
    return res.status(500).json({ success: false, message: 'Could not create follow-up' });
  }
});

// GET /list?status=pending|done&customer=... — all statuses are derived from
// today's actual journal before filtering; this also handles partial receipts.
router.get('/list', async (req, res) => {
  try {
    const filter = {};
    if (norm(req.query.customer)) filter.customer_name = norm(req.query.customer);
    const status = norm(req.query.status).toLowerCase();
    if (status && !['pending', 'done'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const query = PaymentFollowup.find(filter).sort({ createdAt: -1 });
    const limit = Number(req.query.limit);
    if (Number.isInteger(limit) && limit > 0) query.limit(Math.min(limit, 500));
    const records = await query.lean();
    const enriched = await enrichFollowups(records);
    return res.json({
      success: true,
      result: status ? enriched.filter((row) => row.effectiveStatus === status) : enriched,
    });
  } catch (error) {
    logger.error({ err: error.message }, 'List payment follow-ups failed');
    return res.status(500).json({ success: false, message: 'Could not load follow-ups' });
  }
});

// Edit next contact date, ownership, customer promise, title and notes. Never
// update ledger balances or pretend a promised payment was actually received.
router.patch('/:id', async (req, res) => {
  try {
    const payload = req.body || {};
    const update = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'followup_date')) {
      const nextDate = parseDate(payload.followup_date, null);
      if (!nextDate) return res.status(400).json({ success: false, message: 'Valid follow-up date required' });
      update.followup_date = nextDate;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'promised_date')) {
      const nextPromise = payload.promised_date ? parseDate(payload.promised_date) : null;
      if (payload.promised_date && !nextPromise) {
        return res.status(400).json({ success: false, message: 'Invalid promised date' });
      }
      update.promised_date = nextPromise;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'assigned_to')) update.assigned_to = norm(payload.assigned_to).slice(0, 120);
    if (Object.prototype.hasOwnProperty.call(payload, 'remark')) update.remark = norm(payload.remark).slice(0, 1000);
    if (Object.prototype.hasOwnProperty.call(payload, 'title')) update.title = norm(payload.title).slice(0, 200);
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: 'No valid changes provided' });

    const updated = await PaymentFollowup.findByIdAndUpdate(req.params.id, {
      $set: update,
      $push: { history: { $each: [historyEvent(req, 'updated', 'Updated follow-up details')], $slice: -60 } },
    }, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ success: false, message: 'Follow-up not found' });
    return res.json({ success: true, result: updated });
  } catch (error) {
    logger.error({ err: error.message }, 'Update payment follow-up failed');
    return res.status(500).json({ success: false, message: 'Could not update follow-up' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const status = norm(req.body.status).toLowerCase();
    if (!['pending', 'done'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const updated = await PaymentFollowup.findByIdAndUpdate(req.params.id, {
      $set: {
        status, closed_at: status === 'done' ? new Date() : null,
        closure_reason: status === 'done' ? 'manual' : '',
      },
      $push: { history: { $each: [historyEvent(req, status === 'done' ? 'completed' : 'reopened',
        norm(req.body.note))], $slice: -60 } },
    }, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ success: false, message: 'Follow-up not found' });
    return res.json({ success: true, result: updated });
  } catch (error) {
    logger.error({ err: error.message }, 'Change payment follow-up status failed');
    return res.status(500).json({ success: false, message: 'Could not change status' });
  }
});

async function dispatchReminder(id, actor) {
  const stored = await PaymentFollowup.findById(id).lean();
  if (!stored) return { status: 404, message: 'Follow-up not found' };
  const [row] = await enrichFollowups([stored]);
  if (row.effectiveStatus !== 'pending' || row.remainingAmount <= 0 || row.liveOutstanding === null) {
    return { status: 409, message: 'No verified unpaid receivable for this follow-up' };
  }
  const phone = phoneNumber(row.customer_mobile);
  if (!phone) return { status: 400, message: 'Customer WhatsApp number is missing or invalid' };
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
  const prior = new Date(row.last_reminder || row.Last_Reminder || 0);
  if (prior > cutoff) return { status: 429, message: 'Reminder already sent within the past 48 hours' };

  // Atomic short-lived claim: two staff members cannot double-send the same
  // approved template by clicking concurrently. Failures release the claim.
  const claim = await PaymentFollowup.findOneAndUpdate({
    _id: id, status: 'pending',
    $and: [
      { $or: [{ reminder_lock_until: null }, { reminder_lock_until: { $lte: now } }] },
      { $or: [{ last_reminder: null }, { last_reminder: { $lte: cutoff } }] },
      { $or: [{ Last_Reminder: null }, { Last_Reminder: { $lte: cutoff } }] },
    ],
  }, { $set: { reminder_lock_until: new Date(now.getTime() + REMINDER_LOCK_MS) } }, { new: true });
  if (!claim) return { status: 429, message: 'Reminder already sent or currently being processed' };

  const dateKey = indiaDay(row.followup_date);
  const template = dateKey === indiaDay(now) ? FOLLOWUP_DUE_TODAY_TEMPLATE : FOLLOWUP_FRIENDLY_TEMPLATE;
  const params = [
    row.customer_name || 'Customer',
    String(row.remainingAmount),
    asDateLabel(row.followup_date),
    row.title || row.remark || '-',
  ].map((value) => ({ type: 'text', text: String(value) }));
  try {
    await sanjusk.sendTemplate({
      phone, template, language: 'en_US',
      components: [{ type: 'body', parameters: params }],
      requireEnabled: true,
    });
    await PaymentFollowup.updateOne({ _id: id }, {
      $set: { last_reminder: now, Last_Reminder: now, reminder_lock_until: null },
      $inc: { reminder_count: 1, Reminder_Count: 1 },
      $push: { history: { $each: [{ at: now, by: actor, action: 'reminder_sent',
        note: 'Approved WhatsApp template: ' + template }], $slice: -60 } },
    });
    return { status: 200, message: 'Reminder sent', template };
  } catch (error) {
    await PaymentFollowup.updateOne({ _id: id }, { $set: { reminder_lock_until: null } })
      .catch((releaseError) => logger.error({ err: releaseError.message }, 'Reminder claim release failed'));
    logger.error({ err: error.message, followupId: id }, 'Payment follow-up reminder failed');
    return { status: 502, message: 'WhatsApp reminder failed; check the SanjuSK integration and approved templates' };
  }
}

// Explicit staff approval for every paid WhatsApp send; no text-message
// fallback outside the customer-service window.
router.post('/:id/send-reminder', async (req, res) => {
  if (req.body?.confirmed !== true) return res.status(400).json({
    success: false, message: 'Confirm reminder delivery explicitly',
  });
  const result = await dispatchReminder(req.params.id, userLabel(req));
  return res.status(result.status).json({ success: result.status === 200, ...result });
});

// Legacy bulk route: opt-in only, deliberately NOT registered with a scheduler.
// Do not send thousands of paid messages from a deployment or cron by default.
router.post('/send-overdue-reminders', requireInternalKey, async (req, res) => {
  if (process.env.PAYMENT_FOLLOWUP_BULK_REMINDERS_ENABLED !== 'true') {
    return res.status(403).json({
      success: false, message: 'Bulk sending disabled; use individually approved reminders',
    });
  }
  try {
    const minDays = Math.max(0, Math.min(30, Number(req.body?.minDaysOverdue ?? 3) || 3));
    const cutoff = new Date(Date.now() - minDays * 86400000);
    const stored = await PaymentFollowup.find({
      status: 'pending', followup_date: { $lte: cutoff },
    }).lean();
    const current = (await enrichFollowups(stored)).filter((row) => row.effectiveStatus === 'pending');
    if (req.body?.dryRun !== false) return res.json({ success: true, preview: true, total: current.length });
    let sent = 0, failed = 0, skipped = 0;
    for (const row of current) {
      const result = await dispatchReminder(row._id, userLabel(req));
      if (result.status === 200) sent += 1;
      else if ([400, 404, 409, 429].includes(result.status)) skipped += 1;
      else failed += 1;
    }
    return res.json({ success: failed === 0, sent, failed, skipped, total: current.length });
  } catch (error) {
    logger.error({ err: error.message }, 'Bulk follow-up processing failed');
    return res.status(500).json({ success: false, message: 'Could not process follow-ups' });
  }
});

module.exports = router;
