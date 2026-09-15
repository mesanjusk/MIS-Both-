const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { enforceWhatsApp24hWindow } = require('../middleware/whatsapp24hGuard');
const asyncHandler = require('../utils/asyncHandler');
const sanjusk = require('../services/sanjuskApiService');
const sanjuskConversation = require('../services/sanjuskConversationService');

const {
  exchangeMetaToken,
  manualConnect,
  listAccounts,
  deleteAccount,
  getStatus,
  sendText,
  sendTemplate,
  sendAdminAlert,
  sendFlow,
  sendMedia,
  sendMessage,
  createAutoReplyRule,
  updateAutoReplyRule,
  deleteAutoReplyRule,
  toggleAutoReplyRule,
  getTemplates,
  verifyWebhook,
  getAutoReplyRules,
  receiveWebhook,
  getMessages,
  getAnalytics,
} = require('../controllers/whatsappController');

const { createUpload, limitRequestSize, MB } = require('../middleware/uploadLimits');

// Rate limiter for sending messages
const messagingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

// memory storage (best for cloudinary)
// Unbounded before. WhatsApp caps documents at 100 MB and video at 16 MB, so
// this is the largest media the platform would accept anyway.
const MAX_MEDIA_BYTES = 100 * MB;
const upload = createUpload({ maxFileBytes: MAX_MEDIA_BYTES });
const boundRequest = limitRequestSize(MAX_MEDIA_BYTES + MB);

// ---------- Embedded Signup ----------
router.post('/embedded-signup/exchange-code', requireAuth, exchangeMetaToken);

// ---------- Manual connect (for SaaS clients) ----------
router.post('/manual-connect', requireAuth, manualConnect);

// ---------- Account routes ----------
router.get('/accounts', listAccounts);
router.get('/status', getStatus);
router.delete('/accounts/:id', requireAuth, deleteAccount);

// ---------- Messaging routes ----------
router.post('/send-text', requireAuth, messagingLimiter, enforceWhatsApp24hWindow, sendText);
router.post('/send-template', requireAuth, messagingLimiter, enforceWhatsApp24hWindow, sendTemplate);
router.post('/send-admin-alert', requireAuth, messagingLimiter, sendAdminAlert);
router.post('/send-flow', requireAuth, messagingLimiter, enforceWhatsApp24hWindow, sendFlow);

router.post(
  '/send-media',
  requireAuth,
  messagingLimiter,
  boundRequest,
  upload.single('file'),
  enforceWhatsApp24hWindow,
  sendMedia
);

router.post('/send-message', requireAuth, messagingLimiter, enforceWhatsApp24hWindow, sendMessage);

// ---------- Auto Reply ----------
router.post('/auto-reply', requireAuth, createAutoReplyRule);
router.get('/auto-reply', requireAuth, getAutoReplyRules);
router.put('/auto-reply/:id', requireAuth, updateAutoReplyRule);
router.delete('/auto-reply/:id', requireAuth, deleteAutoReplyRule);
router.patch('/auto-reply/:id/toggle', requireAuth, toggleAutoReplyRule);

// Compatibility aliases
router.get('/auto-replies', requireAuth, getAutoReplyRules);
router.get('/auto-reply-rules', requireAuth, getAutoReplyRules);

// ---------- Templates ----------
router.get('/templates', requireAuth, getTemplates);

// ---------- Messages API ----------
router.get('/messages', requireAuth, getMessages);
router.get('/analytics', requireAuth, getAnalytics);

// ---------- SanjuSK inbox ----------
// The Home → Inbox tab reads its WhatsApp account, conversations and send path
// from the SanjuSK API configured under Admin → API — never the direct-Meta
// account. These are separate from the admin-only /api/sanjusk/* config routes:
// they expose no credential and are usable by any authenticated staff member,
// exactly like the existing /messages and /send-text routes.
//
// requireEnabled:false so the inbox works whenever a key is saved, without also
// forcing every other outbound MIS message through SanjuSK (that remains the
// admin's separate on/off choice on the API screen).

const normalizeSanjuskMessage = (row = {}) => {
  const direction =
    row.direction ||
    (row.fromMe || row.isOutbound ? 'outgoing' : row.type === 'outgoing' ? 'outgoing' : 'incoming');
  return {
    ...row,
    id: row.id || row._id || row.messageId || row.wamid || undefined,
    direction,
    from: row.from || row.sender || row.wa_id || '',
    to: row.to || row.recipient || '',
    body: row.text || row.body || row.message || row.caption || '',
    timestamp: row.timestamp || row.createdAt || row.time || null,
    messageType: row.messageType || row.type || 'text',
    status: row.status || '',
  };
};

router.get(
  '/sanjusk/status',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const data = await sanjusk.getStatus({ requireEnabled: false });
    res.json({ success: true, data: data?.data || data || {} });
  })
);

// Two different questions, and the provider only answers one of them
// directly.
//
// With `since`, the caller is polling a cursor they already hold, and passing
// it straight through is exactly right. Without one, the caller means "show me
// the conversation" — but the provider's endpoint is ascending and limited, so
// a bare request returns the oldest rows in the account's history. That is
// what the inbox was doing on a five-second timer: re-reading the first page
// ever written and showing nothing from the last several days, in either
// direction. Route that case through the tail reader, which walks the cursor
// to the newest messages and keeps them.
router.get(
  '/sanjusk/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));

    if (!req.query.since) {
      const { rows, nextSince } = await sanjuskConversation.getRecentMessages({ limit });
      return res.json({
        success: true,
        data: rows.map(normalizeSanjuskMessage),
        nextSince: nextSince || null,
        hasMore: false,
      });
    }

    const data = await sanjusk.listMessages({
      since: req.query.since,
      direction: req.query.direction,
      phone: req.query.phone,
      limit,
      requireEnabled: false,
    });
    const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return res.json({
      success: true,
      data: rows.map(normalizeSanjuskMessage),
      nextSince: data?.nextSince || null,
      hasMore: Boolean(data?.hasMore),
    });
  })
);

router.post(
  '/sanjusk/send-text',
  requireAuth,
  messagingLimiter,
  asyncHandler(async (req, res) => {
    const phone = String(req.body?.to || req.body?.phone || '').replace(/\D/g, '');
    const text = String(req.body?.text || req.body?.body || '').trim();
    if (!phone || !text) {
      return res.status(400).json({ success: false, message: 'to and text are required' });
    }
    const data = await sanjusk.sendText({ phone, text, requireEnabled: false });
    res.json({ success: true, data });
  })
);

router.post(
  '/sanjusk/send-media',
  requireAuth,
  messagingLimiter,
  asyncHandler(async (req, res) => {
    const phone = String(req.body?.to || req.body?.phone || '').replace(/\D/g, '');
    const link = String(req.body?.link || req.body?.mediaUrl || '').trim();
    const type = String(req.body?.type || 'image').trim();
    const caption = String(req.body?.caption || '').trim();
    const filename = String(req.body?.filename || '').trim();
    if (!phone || !link) {
      return res.status(400).json({ success: false, message: 'to and a media link are required' });
    }
    const data = await sanjusk.sendMedia({ phone, type, link, caption, filename, requireEnabled: false });
    res.json({ success: true, data });
  })
);

// ---------- Webhook (no auth) ----------
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// ---------- Test route ----------
router.get('/test', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'WhatsApp API Active',
  });
});

module.exports = router;