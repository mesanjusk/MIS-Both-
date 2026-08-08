/**
 * SocialProviders.js — /api/social/providers/{meta,youtube,linkedin,tiktok}/{connect,callback}
 *
 * OAuth connect/callback for each platform. Follows the same state-encoding
 * pattern already used by routes/Gmail.js (`/auth-url` -> base64 JSON state
 * -> `/callback`, no auth middleware on callback since the provider redirects
 * the browser here directly and cannot carry a Bearer header).
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const { recordAuditEvent } = require('../services/social/socialAuditLogService');
const logger = require('../utils/logger');

const metaOAuthService = require('../services/social/providers/metaOAuthService');
const youtubeOAuthService = require('../services/social/providers/youtubeOAuthService');
const linkedinOAuthService = require('../services/social/providers/linkedinOAuthService');
const tiktokOAuthService = require('../services/social/providers/tiktokOAuthService');

const PROVIDERS = {
  meta: metaOAuthService,
  youtube: youtubeOAuthService,
  linkedin: linkedinOAuthService,
  tiktok: tiktokOAuthService,
};

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function isSafeRedirect(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const allowed = [process.env.FRONTEND_URL, process.env.ALLOWED_ORIGINS]
      .filter(Boolean)
      .flatMap((s) => s.split(','))
      .map((s) => s.trim().replace(/\/$/, ''));
    return allowed.some((a) => parsed.origin === a);
  } catch {
    return false;
  }
}

function resultPage({ ok, title, message, returnTo }) {
  return `
    <html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
    <body style="font-family:Arial,sans-serif;padding:24px;line-height:1.6">
      <h2 style="color:${ok ? '#1a7f37' : '#cf222e'}">${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      ${returnTo ? `<script>setTimeout(()=>{ window.location.href=${JSON.stringify(returnTo)} },1600)</script>` : ''}
    </body></html>
  `;
}

// GET /api/social/providers/:provider/connect — returns the OAuth URL (requires auth so we can attribute connectedBy)
router.get('/:provider/connect', requireAuth, requireSocialPermission('socialAccountsManage'), (req, res) => {
  const service = PROVIDERS[req.params.provider];
  if (!service) return res.status(404).json({ success: false, message: 'Unknown provider' });

  try {
    const returnTo = `${process.env.FRONTEND_URL || ''}/social/accounts`;
    const state = Buffer.from(
      JSON.stringify({ userId: req.user.id, userName: req.user.userName || '', returnTo })
    ).toString('base64');
    const authUrl = service.getAuthUrl(state);
    res.json({ success: true, authUrl });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// GET /api/social/providers/:provider/callback — no auth middleware, provider redirects the browser here
router.get('/:provider/callback', async (req, res) => {
  const providerName = req.params.provider;
  const service = PROVIDERS[providerName];
  if (!service) return res.status(404).send('Unknown provider');

  const { code, state, error: oauthError, error_description: oauthErrorDescription } = req.query;

  let returnTo = `${process.env.FRONTEND_URL || ''}/social/accounts`;
  let user = null;
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64').toString());
    if (parsed.returnTo && isSafeRedirect(parsed.returnTo)) returnTo = parsed.returnTo;
    if (parsed.userId) user = { id: parsed.userId, userName: parsed.userName };
  } catch {
    // malformed state — fall back to defaults
  }

  if (oauthError) {
    return res.status(400).send(
      resultPage({ ok: false, title: `${providerName} connection cancelled`, message: oauthErrorDescription || oauthError, returnTo })
    );
  }

  try {
    const result = await service.handleCallback({ code, user });
    const accountList = Array.isArray(result) ? result : Object.values(result).flat();
    await recordAuditEvent({
      action: 'account.connected',
      entityType: 'account',
      entityId: Array.isArray(result) ? result[0]?._id : undefined,
      platform: providerName,
      actor: user?.id,
      actorName: user?.userName,
      detail: `Connected via ${providerName} OAuth`,
      req,
    });
    return res.send(
      resultPage({
        ok: true,
        title: `${providerName} connected successfully`,
        message: Array.isArray(accountList) ? `Connected ${accountList.length || ''} account(s).` : 'Connected.',
        returnTo,
      })
    );
  } catch (error) {
    logger.error({ err: error.message, provider: providerName }, '[social] OAuth callback failed');
    return res.status(error.statusCode || 500).send(
      resultPage({ ok: false, title: `${providerName} connection failed`, message: error.message, returnTo })
    );
  }
});

module.exports = router;
