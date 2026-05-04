const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const {
  wireIncomingMessages,
  getStatus,
  startConnection,
  stopConnection,
  getInbox,
  getConversation,
  markConversationRead,
  sendText,
  getLogs,
  getProvider,
  updateProvider,
} = require('../controllers/baileysController');

// Wire incoming message listener once when this module is loaded
wireIncomingMessages();

// ── Connection ────────────────────────────────────────────────────────────────
router.get('/status',       requireAuth, getStatus);
router.post('/connect',     requireAuth, startConnection);
router.post('/disconnect',  requireAuth, stopConnection);

// ── Inbox & Conversations ─────────────────────────────────────────────────────
router.get('/inbox',                                requireAuth, getInbox);
router.get('/conversation/:conversationKey',        requireAuth, getConversation);
router.post('/conversation/:conversationKey/read',  requireAuth, markConversationRead);

// ── Send ──────────────────────────────────────────────────────────────────────
router.post('/send-text', requireAuth, sendText);

// ── Logs ──────────────────────────────────────────────────────────────────────
router.get('/logs', requireAuth, getLogs);

// ── Provider setting (admin: which API to use) ────────────────────────────────
router.get('/provider',  requireAuth, getProvider);
router.put('/provider',  requireAuth, updateProvider);

module.exports = router;
