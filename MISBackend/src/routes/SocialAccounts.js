/**
 * SocialAccounts.js — /api/social/accounts
 *
 * Connected social platform accounts (Pages/channels/organizations/creators).
 * Tokens are never returned to the frontend — see SocialAccount.toSafeJSON().
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialAccount = require('../repositories/SocialAccount');
const AppError = require('../utils/AppError');
const { SOCIAL_PLATFORMS } = require('../constants/social');
const { getProvider, providers } = require('../services/social/providers');
const { recordAuditEvent } = require('../services/social/socialAuditLogService');

router.use(requireAuth);

// GET /api/social/accounts — list, optionally filtered by platform/status
router.get('/', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.platform) filter.platform = req.query.platform;
    if (req.query.status) filter.status = req.query.status;
    const accounts = await SocialAccount.find(filter).sort({ platform: 1, createdAt: -1 });
    res.json({ success: true, data: accounts.map((a) => a.toSafeJSON()) });
  } catch (error) {
    next(error);
  }
});

// GET /api/social/accounts/platform-status — one row per supported platform for the dashboard
router.get('/platform-status', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const accounts = await SocialAccount.find({}).lean();

    const rows = SOCIAL_PLATFORMS.map((platform) => {
      const platformAccounts = accounts.filter((a) => a.platform === platform);
      const configured = providers[platform]?.isConfigured?.() ?? false;
      let status = 'NOT_CONFIGURED';
      if (configured) {
        if (!platformAccounts.length) status = 'DISCONNECTED';
        else if (platformAccounts.some((a) => a.status === 'CONNECTED')) status = 'CONNECTED';
        else status = platformAccounts[0].status;
      }
      return {
        platform,
        configured,
        status,
        accountCount: platformAccounts.length,
        accounts: platformAccounts.map((a) => ({ id: a._id, name: a.name, status: a.status })),
      };
    });

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const account = await SocialAccount.findById(req.params.id);
    if (!account) throw new AppError('Social account not found', 404);
    res.json({ success: true, data: account.toSafeJSON() });
  } catch (error) {
    next(error);
  }
});

// POST /api/social/accounts/:id/validate — real API call, no fake green checkmarks
router.post('/:id/validate', requireSocialPermission('socialAccountsManage'), async (req, res, next) => {
  try {
    const account = await SocialAccount.findById(req.params.id).select('+accessTokenEncrypted +refreshTokenEncrypted');
    if (!account) throw new AppError('Social account not found', 404);

    const provider = getProvider(account.platform);
    const result = await provider.validateConnection(account);

    await recordAuditEvent({
      action: result.connected ? 'account.token_refreshed' : 'account.validation_failed',
      entityType: 'account',
      entityId: account._id,
      platform: account.platform,
      actor: req.user.id,
      actorName: req.user.userName,
      detail: result.connected ? 'Connection validated' : result.message,
      req,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/disconnect', requireSocialPermission('socialAccountsManage'), async (req, res, next) => {
  try {
    const account = await SocialAccount.findById(req.params.id).select('+accessTokenEncrypted +refreshTokenEncrypted');
    if (!account) throw new AppError('Social account not found', 404);

    const provider = getProvider(account.platform);
    await provider.disconnect(account);

    await recordAuditEvent({
      action: 'account.disconnected',
      entityType: 'account',
      entityId: account._id,
      platform: account.platform,
      actor: req.user.id,
      actorName: req.user.userName,
      req,
    });

    res.json({ success: true, data: account.toSafeJSON() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
