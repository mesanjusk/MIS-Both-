const express = require('express');
const router = express.Router();
const { requireAuth, requireInternalKey } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { sendDigestToAllUsers } = require('../services/messageScheduler');
const logger = require('../utils/logger');

// send-digest: accept either internal key (cron job) or authenticated admin (manual trigger)
router.post('/send-digest', async (req, res, next) => {
  const hasInternalKey = !!req.headers['x-internal-key'];
  if (hasInternalKey) {
    return requireInternalKey(req, res, next);
  }
  // Fall through to auth + admin check
  requireAuth(req, res, next);
}, async (req, res, next) => {
  // If we got here via JWT (not internal key), enforce admin role
  if (!req.headers['x-internal-key']) {
    return requireAdmin(req, res, next);
  }
  next();
}, async (req, res) => {
  try {
    const mode = String(req.body?.mode || req.query?.mode || 'morning').toLowerCase() === 'evening' ? 'evening' : 'morning';
    const result = await sendDigestToAllUsers(mode);
    res.json({ success: true, mode, result });
  } catch (error) {
    logger.error('Manual digest failed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
