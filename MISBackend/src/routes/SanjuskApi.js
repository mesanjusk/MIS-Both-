const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const sanjusk = require('../services/sanjuskApiService');

/**
 * Admin → API: the SanjuSK WhatsApp integration.
 *
 * Every route here is tier-4 admin only (requireAdminOrOwner, not
 * requireAdmin — a manager should not be able to read or replace the
 * credential the business sends WhatsApp messages with).
 *
 * Note what is NOT here: the inbound webhook. SanjuSK pushes messages to
 * POST /webhook/metabsp, which is public by necessity and authenticates by
 * HMAC signature instead of a session — see routes/webhook.js and
 * controllers/whatsappController.js's metabspWebhookReceive. Putting it
 * behind this router's admin guard would reject every delivery.
 */
router.use(requireAuth, requireAdminOrOwner);

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const config = await sanjusk.getPublicConfig();
    res.json({
      success: true,
      result: {
        ...config,
        // Where to point the SanjuSK webhook destination at this MIS
        // instance. Derived rather than typed, so it cannot drift from the
        // route that actually serves it.
        inboundWebhookPath: '/webhook/metabsp',
        // The secret is an env var on this server, not stored config — the
        // screen can say whether it is set without ever revealing it.
        inboundSecretConfigured: Boolean(process.env.METABSP_WEBHOOK_SECRET),
      },
    });
  })
);

router.put(
  '/config',
  asyncHandler(async (req, res) => {
    const { baseUrl, apiKey, enabled } = req.body || {};
    const result = await sanjusk.saveConfig({
      baseUrl,
      apiKey,
      enabled,
      updatedBy: req.user?.userName || req.user?.id || '',
    });
    res.json({ success: true, result });
  })
);

router.delete(
  '/config/key',
  asyncHandler(async (req, res) => {
    const result = await sanjusk.clearApiKey({ updatedBy: req.user?.userName || req.user?.id || '' });
    res.json({ success: true, result });
  })
);

/**
 * Proves the saved key works and names the number it sends from.
 *
 * requireEnabled:false on purpose — an administrator has to be able to
 * verify a key before switching traffic onto it, which is exactly the moment
 * the integration is still off.
 */
router.post(
  '/test',
  asyncHandler(async (_req, res) => {
    const data = await sanjusk.getStatus({ requireEnabled: false });
    res.json({ success: true, result: data?.data || data });
  })
);

router.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    const data = await sanjusk.listTemplates({ requireEnabled: false });
    res.json({ success: true, result: data?.data || [] });
  })
);

router.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const data = await sanjusk.listMessages({
      since: req.query.since,
      direction: req.query.direction,
      phone: req.query.phone,
      limit: Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
      requireEnabled: false,
    });
    res.json({
      success: true,
      result: data?.data || [],
      nextSince: data?.nextSince || null,
      hasMore: Boolean(data?.hasMore),
    });
  })
);

/**
 * A single message, sent from this screen, so an administrator can confirm
 * the whole path end to end before trusting it with real traffic.
 */
router.post(
  '/send-test',
  asyncHandler(async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const text = String(req.body?.text || '').trim();
    const template = String(req.body?.template || '').trim();

    if (!phone) {
      return res.status(400).json({ success: false, message: 'A phone number is required.' });
    }
    if (!text && !template) {
      return res.status(400).json({ success: false, message: 'Enter a message, or choose a template.' });
    }

    const data = template
      ? await sanjusk.sendTemplate({
          phone,
          template,
          language: req.body?.language || 'en_US',
          requireEnabled: false,
        })
      : await sanjusk.sendText({ phone, text, requireEnabled: false });

    res.json({ success: true, result: data });
  })
);

module.exports = router;
