const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { generateAuthUrl, saveTokensFromCode } = require('../services/gmailOAuthService');
const { sendEmail } = require('../services/gmailSendService');
const GmailAccount  = require('../repositories/GmailAccount');
const EmailHistory  = require('../repositories/EmailHistory');
const PurchaseOrder = require('../repositories/purchaseOrder');
const logger        = require('../utils/logger');

// 100 MB per-file limit; files go to memory then straight to Gmail API or Drive
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── OAuth callback — NO auth middleware (Google redirects here directly) ──────
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');

  let addedBy = 'system';
  let returnTo = `${process.env.FRONTEND_URL || ''}/gmail/accounts`;
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64').toString());
    if (parsed.addedBy) addedBy = parsed.addedBy;
    if (parsed.returnTo) returnTo = parsed.returnTo;
  } catch { /* ignore malformed state */ }

  try {
    const result = await saveTokensFromCode(code, addedBy);
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

// Returns the Google OAuth URL so the frontend can redirect the browser to it
router.get('/auth-url', (req, res) => {
  try {
    const returnTo = `${process.env.FRONTEND_URL || ''}/gmail/accounts`;
    const state    = Buffer.from(
      JSON.stringify({ addedBy: req.user?.userName || '', returnTo })
    ).toString('base64');
    res.json({ success: true, authUrl: generateAuthUrl(state) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List connected Gmail accounts (tokens excluded)
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await GmailAccount
      .find({}, { refreshToken: 0, accessToken: 0 })
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
router.delete('/accounts/:accountId', async (req, res) => {
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
router.post('/send', upload.array('files', 20), async (req, res) => {
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
    const filter = {};
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
      EmailHistory.countDocuments({ sentAt: { $gte: todayStart }, status: 'sent' }),
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
