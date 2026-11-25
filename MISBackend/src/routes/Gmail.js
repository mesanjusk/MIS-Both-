const express = require('express');
const { createUpload, limitRequestSize, MB } = require('../middleware/uploadLimits');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, requireAdminOrOwner, requireRole } = require('../middleware/authorize');
const { requirePermission } = require('../middleware/requirePermission');
const { createState, consumeState } = require('../services/oauthStateService');

const OAUTH_PURPOSE = 'gmail';
const { generateAuthUrl, saveTokensFromCode } = require('../services/gmailOAuthService');
const { sendEmail } = require('../services/gmailSendService');
const GmailAccount  = require('../repositories/GmailAccount');
const EmailHistory  = require('../repositories/EmailHistory');
const PurchaseOrder = require('../repositories/purchaseOrder');
const logger        = require('../utils/logger');
const { isValidObjectId } = require('mongoose');
const { PRINT_SOURCE, SYNCABLE_ACCOUNTS, normalizeRecipients, syncPrintSentAccount } = require('../services/printSentService');
const { PRINT_TIME_ZONE, recentPrintDates, printDateRange } = require('../utils/printSentDates');
const corsOptions = require('../config/corsOptions');

const printStaff = requireRole(['worker', 'delivery', 'office admin', 'office design', 'office marketing',
  'office staff', 'officestaff', 'otheroffice', 'designer', 'dataentry', 'dataentryuser', 'accounts', 'accounts user', 'accountsuser', 'accountant']);
const defaultPrintSettingsUrl = 'https://dash.sanjusk.in/home';

// 20 files of 100 MB each let one request hold roughly 2 GB in memory. Gmail
// itself refuses a message over 25 MB, so anything larger could never have been
// delivered — the limits now match what the API will actually accept.
const MAX_ATTACHMENT_BYTES = 25 * MB;
const MAX_ATTACHMENTS = 10;
const upload = createUpload({ maxFileBytes: MAX_ATTACHMENT_BYTES, maxFiles: MAX_ATTACHMENTS });
const boundRequest = limitRequestSize(MAX_ATTACHMENT_BYTES + 10 * MB);

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── OAuth callback — NO auth middleware (Google redirects here directly) ──────
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code && !state) return res.status(400).send('Missing authorization code');

  // Redeem the state this server issued. Both the connecting user and the
  // redirect come from that row — the callback used to be trusted for both.
  const issued = await consumeState(state, OAUTH_PURPOSE);
  if (!issued) {
    logger.warn('[gmail] OAuth callback rejected: invalid or expired state');
    return res.status(400).send(`
      <html><head><meta charset="utf-8"><title>Gmail Connection Failed</title></head>
      <body style="font-family:Arial,sans-serif;padding:24px">
        <h2 style="color:#cf222e">Gmail connection failed</h2>
        <p>This sign-in link is invalid, expired, or has already been used. Start again from the app.</p>
      </body></html>
    `);
  }

  const addedBy  = issued.user_name || 'system';
  const returnTo = issued.return_to || `${process.env.FRONTEND_URL || ''}/gmail/accounts`;

  if (issued.meta?.printSent === true) {
    const settingsUrl = issued.return_to || defaultPrintSettingsUrl;
    if (!code) return res.redirect(`${settingsUrl}?printSentGmail=cancelled`);
    try {
      await saveTokensFromCode(code, addedBy, { printSent: true });
      return res.redirect(`${settingsUrl}?printSentGmail=connected`);
    } catch (error) {
      logger.warn({ code: error.code }, '[print-sent] Gmail authorization failed');
      return res.redirect(`${settingsUrl}?printSentGmail=error`);
    }
  }
  if (!code) return res.status(400).send('Missing authorization code');

  try {
    const result = await saveTokensFromCode(code, addedBy);
    logger.info('[gmail] OAuth connection completed');
    return res.send(`
      <html><head><meta charset="utf-8"><title>Gmail Connected</title></head>
      <body style="font-family:Arial,sans-serif;padding:24px;line-height:1.6">
        <h2 style="color:#1a7f37">Gmail connected successfully</h2>
        <p><strong>${escapeHtml(result.email)}</strong> is now linked to MIS.</p>
        <p>Redirecting back to the dashboard...</p>
        <script>setTimeout(()=>{ window.location.href=${JSON.stringify(returnTo)} },1400)</script>
      </body></html>
    `);
  } catch (err) {
    logger.error({ err: err.message }, '[gmail] OAuth callback failed');
    return res.status(500).send(`
      <html><head><meta charset="utf-8"><title>Gmail Connection Failed</title></head>
      <body style="font-family:Arial,sans-serif;padding:24px">
        <h2 style="color:#cf222e">Gmail connection failed</h2>
        <p>${escapeHtml(err.message)}</p>
      </body></html>
    `);
  }
});

// ── All routes below require a valid JWT ──────────────────────────────────────
router.use(requireAuth);

router.get('/print-sent', printStaff, async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
    const pageSize = 24;
    const entries = await EmailHistory.aggregate([
      { $match: { source: PRINT_SOURCE } },
      { $sort: { sentAt: -1, _id: -1 } },
      { $unwind: { path: '$attachments', includeArrayIndex: 'attachmentIndex' } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize + 1 },
      { $project: {
        _id: 0, id: { $concat: [{ $toString: '$_id' }, '-', { $toString: '$attachmentIndex' }] },
        recipient: '$toName', filename: '$attachments.originalName', thumbnail: '$attachments.thumbnail',
      } },
    ]);
    res.set('Cache-Control', 'private, no-store');
    res.json({ result: entries.slice(0, pageSize), hasMore: entries.length > pageSize });
  } catch (error) { next(error); }
});

router.get('/print-sent/folders', printStaff, async (_req, res, next) => {
  try {
    const dates = recentPrintDates();
    const folders = await EmailHistory.aggregate([
      { $match: { source: PRINT_SOURCE, sentAt: printDateRange(dates.at(-1), dates[0]) } },
      { $sort: { sentAt: -1, _id: -1 } },
      { $group: {
        _id: {
          date: { $dateToString: { date: '$sentAt', format: '%Y-%m-%d', timezone: PRINT_TIME_ZONE } },
          email: '$toEmail',
        },
        name: { $first: '$toName' },
        count: { $sum: 1 },
      } },
      { $project: { _id: 0, date: '$_id.date', email: '$_id.email', name: 1, count: 1 } },
    ]);
    res.set('Cache-Control', 'private, no-store');
    res.json({ dates, folders });
  } catch (error) { next(error); }
});

router.get('/print-sent/messages', printStaff, async (req, res, next) => {
  try {
    const { date, recipient } = req.query;
    if (!recentPrintDates().includes(date) || typeof recipient !== 'string' || !recipient || recipient.length > 254) {
      return res.status(400).json({ message: 'Choose a recent print date and recipient.' });
    }
    const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
    const pageSize = 12;
    const messages = await EmailHistory.find({ source: PRINT_SOURCE, sentAt: printDateRange(date), toEmail: recipient })
      .select('sentAt attachments.originalName attachments.thumbnail')
      .sort({ sentAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize + 1).lean();
    res.set('Cache-Control', 'private, no-store');
    res.json({ result: messages.slice(0, pageSize), hasMore: messages.length > pageSize });
  } catch (error) { next(error); }
});

router.use('/print-sent/accounts', requireAdminOrOwner, requirePermission('canUseEmail'));

router.get('/print-sent/accounts', async (_req, res, next) => {
  try {
    const accounts = await GmailAccount.find({ printSentToken: { $exists: true } })
      .select('email printSentEnabled printRecipients printSentLastSync printSentError').sort({ createdAt: -1 }).lean();
    res.set('Cache-Control', 'private, no-store');
    res.json({ result: accounts });
  } catch (error) { next(error); }
});

router.post('/print-sent/accounts/connect', async (req, res, next) => {
  try {
    const origin = req.get('origin');
    const trusted = origin && await new Promise((resolve) => corsOptions.origin(origin, (error, allowed) => resolve(!error && allowed)));
    const state = await createState({ purpose: OAUTH_PURPOSE, user: req.user,
      returnTo: trusted ? `${origin}/home` : defaultPrintSettingsUrl, meta: { printSent: true } });
    res.json({ authUrl: generateAuthUrl(state, { printSent: true }) });
  } catch (error) { next(error); }
});

router.patch('/print-sent/accounts/:id', async (req, res, next) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Gmail account not found.' });
  const updates = {};
  if (req.body?.recipients !== undefined) {
    try {
      updates.printRecipients = normalizeRecipients(req.body.recipients);
    } catch (error) { return res.status(400).json({ message: error.message }); }
    Object.assign(updates, { printSentCursor: null, printSentWindowEnd: null, printSentPageToken: '' });
  }
  if (typeof req.body?.enabled === 'boolean') updates.printSentEnabled = req.body.enabled;
  if (!Object.keys(updates).length) return res.status(400).json({ message: 'No Gmail settings supplied.' });
  try {
    const result = await GmailAccount.updateOne({ _id: req.params.id, printSentToken: { $exists: true } }, {
      $set: { ...updates, printSentLease: null },
    });
    if (!result.matchedCount) return res.status(404).json({ message: 'Gmail account not found.' });
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

router.post('/print-sent/accounts/:id/sync', async (req, res, next) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Gmail account not found.' });
  try {
    const enabled = await GmailAccount.exists({ _id: req.params.id, ...SYNCABLE_ACCOUNTS });
    if (!enabled) return res.status(409).json({ message: 'Connect Gmail and enable sync first.' });
    void syncPrintSentAccount(req.params.id).catch((error) => logger.warn({ code: error.code }, '[print-sent] manual sync failed'));
    return res.status(202).json({ success: true });
  } catch (error) { return next(error); }
});

// Mail reaches customers under the business's own address, and the connected
// account list is an integration credential. A valid token alone used to be
// enough for all of it — including disconnecting an account and sending to an
// arbitrary recipient.
router.use(requirePermission('canUseEmail'));

// Returns the Google OAuth URL so the frontend can redirect the browser to it
router.get('/auth-url', requireAdmin, async (req, res) => {
  try {
    // Server-issued and single-use. The base64 blob this replaced carried the
    // connecting user's identity in the clear, with nothing binding it to a
    // request this server had actually authorized.
    const state = await createState({
      purpose: OAUTH_PURPOSE,
      user: req.user,
      returnTo: `${process.env.FRONTEND_URL || ''}/gmail/accounts`,
    });
    res.json({ success: true, authUrl: generateAuthUrl(state) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List connected Gmail accounts (tokens excluded)
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await GmailAccount
      .find({ refreshToken: { $exists: true } }, { refreshToken: 0, accessToken: 0, printSentToken: 0,
        printRecipients: 0, printSentSyncVersion: 0, printSentCursor: 0, printSentWindowEnd: 0, printSentPageToken: 0, printSentLease: 0 })
      .sort({ createdAt: 1 })
      .lean();
    const today = new Date().toISOString().slice(0, 10);
    res.json({
      success: true,
      result: accounts.map((acc) => ({
        ...acc,
        dailySentCount: acc.dailySentDate === today ? acc.dailySentCount : 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Soft-disconnect a Gmail account
router.delete('/accounts/:accountId', requireAdmin, async (req, res) => {
  try {
    const updated = await GmailAccount.findOneAndUpdate(
      { accountId: req.params.accountId },
      { $set: { isActive: false, isConnected: false } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Account not found' });
    res.json({ success: true, message: 'Account disconnected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Send email (with optional file attachments)
router.post('/send', boundRequest, upload.array('files', MAX_ATTACHMENTS), async (req, res) => {
  const { toEmail, toName, vendorUuid, subject, bodyText, gmailAccountId } = req.body;
  if (!toEmail || !subject) {
    return res.status(400).json({ success: false, message: 'toEmail and subject are required' });
  }

  try {
    const result = await sendEmail({
      preferredAccountId: gmailAccountId || null,
      toEmail,
      toName:    toName || '',
      vendorUuid: vendorUuid || '',
      subject,
      bodyText:  bodyText || '',
      files:     req.files || [],
      sentBy:    req.user?.userName || '',
    });

    return res.json({
      success:    true,
      message:    `Email sent from ${result.emailRecord.fromEmail}`,
      emailId:    result.emailRecord.emailId,
      poNumber:   result.po?.PO_Number || null,
      poCreated:  !!result.po,
      autoPoNote: result.po
        ? `Draft PO #${result.po.PO_Number} created with ₹1 placeholder pricing. Admin update required.`
        : null,
    });
  } catch (err) {
    logger.error({ err: err.message }, '[gmail] /send failed');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Paginated email history with optional filters
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 30, toEmail, vendorUuid, status, fromDate, toDate, subject } = req.query;
    const filter = { source: { $ne: PRINT_SOURCE } };
    if (toEmail)    filter.toEmail   = { $regex: String(toEmail), $options: 'i' };
    if (subject)    filter.subject   = { $regex: String(subject), $options: 'i' };
    if (vendorUuid) filter.vendorUuid = String(vendorUuid);
    if (status)     filter.status    = String(status);
    if (fromDate || toDate) {
      filter.sentAt = {};
      if (fromDate) filter.sentAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.sentAt.$lte = end;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      EmailHistory.find(filter).sort({ sentAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      EmailHistory.countDocuments(filter),
    ]);

    res.json({ success: true, result: rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Quick stats for dashboard widget
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = new Date().toISOString().slice(0, 10);

    const [todaySent, pendingPricing, accounts] = await Promise.all([
      EmailHistory.countDocuments({ sentAt: { $gte: todayStart }, status: 'sent', source: { $ne: PRINT_SOURCE } }),
      PurchaseOrder.countDocuments({ totalAmount: { $lte: 1 }, status: 'draft' }),
      GmailAccount.find({ isActive: true }, { refreshToken: 0, accessToken: 0 }).lean(),
    ]);

    res.json({
      success: true,
      result: {
        todaySent,
        pendingPricing,
        accounts: accounts.map((a) => ({
          accountId:     a.accountId,
          email:         a.email,
          isConnected:   a.isConnected,
          dailySentCount: a.dailySentDate === todayStr ? a.dailySentCount : 0,
          dailyLimit:    a.dailyLimit,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
