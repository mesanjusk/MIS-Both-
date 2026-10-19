
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const { requirePermission } = require('../middleware/requirePermission');
const { AppSetting } = require('../repositories/appSetting');
const { normalizePhone } = require('../services/leadIdentityService');
const { collectLeads, syncInstagram, importCallLogs, LINK_SETTING } = require('../services/unifiedLeadService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

router.use(requireAuth);
router.get('/', requirePermission('canViewWhatsapp'), asyncHandler(async (_req, res) => {
  const result = await collectLeads();
  return res.json({ success: true, ...result });
}));

// Meta DM permissions and social integration are admin-managed, never open to
// ordinary users or the public Internet. Existing data stays readable if sync fails.
router.post('/sync-instagram', requireAdminOrOwner, asyncHandler(async (_req, res) => {
  const result = await syncInstagram();
  return res.json({ success: true, ...result });
}));

// Persist phone↔Instagram identity when the customer confirms their number.
// Never merge by display name: unrelated people may share names.
router.put('/link-instagram', requireAdminOrOwner, asyncHandler(async (req, res) => {
  const instagramId = String(req.body?.instagramId || '').trim();
  const phone = normalizePhone(req.body?.phone);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(instagramId) || !phone) {
    throw new AppError('A valid Instagram user ID and phone number are required', 400);
  }
  await AppSetting.findOneAndUpdate(
    { key: LINK_SETTING },
    { $set: { ['value.' + instagramId]: phone, description: 'Verified links for cross-channel leads' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return res.json({ success: true, instagramId, phone });
}));

// A reversed link requires a distinct explicit admin action.
router.delete('/link-instagram/:instagramId', requireAdminOrOwner, asyncHandler(async (req, res) => {
  const id = String(req.params.instagramId || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new AppError('Invalid Instagram ID', 400);
  await AppSetting.updateOne({ key: LINK_SETTING }, { $unset: { ['value.' + id]: 1 } });
  return res.json({ success: true });
}));

// Import call events when existing Call Logs screen fetches a selected date.
// Idempotent by provider identity/date, so repeated imports do not duplicate.
router.post('/import-calls', asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body?.logs) || req.body.logs.length > 200) {
    throw new AppError('Supply up to 200 call records per request', 400);
  }
  const day = String(req.body?.day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(day).getTime())) {
    throw new AppError('A valid call log date (YYYY-MM-DD) is required', 400);
  }
  const result = await importCallLogs(req.body.logs, day);
  return res.json({ success: true, ...result });
}));

module.exports = router;
