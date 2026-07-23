const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');
const {
  wireIncomingMessages,
  getStatus,
  startConnection,
  stopConnection,
  getInbox,
  getConversation,
  markConversationRead,
  sendText,
  sendMedia,
  getLogs,
  getProvider,
  updateProvider,
  getActivityProviders,
  updateActivityProvider,
  getGroups,
  getGroupInbox,
  getGroupConversation,
  markGroupRead,
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
router.post('/send-text',  requireAuth, sendText);
router.post('/send-media', requireAuth, sendMedia);

// ── Groups ────────────────────────────────────────────────────────────────────
router.get('/groups',                                   requireAuth, getGroups);
router.get('/group-inbox',                              requireAuth, getGroupInbox);
router.get('/group-conversation/:groupId',              requireAuth, getGroupConversation);
router.post('/group-conversation/:groupId/read',        requireAuth, markGroupRead);

// ── Logs ──────────────────────────────────────────────────────────────────────
router.get('/logs', requireAuth, getLogs);

// ── Provider setting (admin/owner/superadmin only: which API to use) ──────────
router.get('/provider',  requireAuth, requireRole('admin'), getProvider);
router.put('/provider',  requireAuth, requireRole('admin'), updateProvider);

// ── Per-activity provider routing (admin/owner/superadmin only) ───────────────
router.get('/activity-providers', requireAuth, requireRole('admin'), getActivityProviders);
router.put('/activity-providers', requireAuth, requireRole('admin'), updateActivityProvider);

module.exports = router;
