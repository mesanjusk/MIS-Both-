
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
const multer = require('multer');
const { importVcf, updatePhoneLeadName, updateInstagramLeadName } = require('../services/leadContactDirectoryService');
const { classifyLeadConversation, classifyLeadConversations } = require('../services/leadAiService');
const vcfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
}).single('file');
const receiveVcf = (req, res, next) => vcfUpload(req, res, error => {
  if (error?.code === 'LIMIT_FILE_SIZE') return next(new AppError('VCF file must be 20 MB or smaller.', 413));
  if (error) return next(new AppError('Unable to read the VCF file.', 400));
  return next();
});

router.use(requireAuth);
router.get('/', requirePermission('canViewWhatsapp'), asyncHandler(async (req, res) => {
  const result = await collectLeads({
    page: req.query.page, limit: req.query.limit,
    search: req.query.search, channel: req.query.channel,
  });
  return res.json({ success: true, ...result });
}));

// Read-only Gemini classification of a lead's recent chat plus linked MIS orders.
router.post('/classify', requirePermission('canViewWhatsapp'), asyncHandler(async (req, res) => {
  try {
    const result = await classifyLeadConversation({ phone: req.body?.phone, instagramId: req.body?.instagramId });
    if (result.ai?.status === 'not_configured') {
      return res.status(503).json({ success: false, message: 'Gemini is not configured on the MIS backend.', ai: result.ai });
    }
    if (!result.classification) {
      return res.status(503).json({ success: false, message: 'Gemini could not classify this conversation. Try again later.', ai: result.ai });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error.message === 'A valid lead phone or Instagram contact is required') {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}));

// Classify the current Leads page in one Gemini request so cards can be tagged
// without opening each conversation. The input is bounded to one page (25).
router.post('/classify-batch', requirePermission('canViewWhatsapp'), asyncHandler(async (req, res) => {
  const leads = req.body?.leads;
  if (!Array.isArray(leads) || leads.length > 25) {
    throw new AppError('Supply up to 25 leads per classification request.', 400);
  }
  const result = await classifyLeadConversations(leads);
  if (result.ai?.status === 'not_configured') {
    return res.status(503).json({ success: false, message: 'Gemini is not configured on the MIS backend.', ai: result.ai });
  }
  return res.json({ success: true, ...result });
}));

// VCF import is admin-only and runs in bounded Mongo bulk updates. It never
// updates Customers, WhatsApp Contact.name, or staff-entered leadName.
router.post('/import-vcf', requireAdminOrOwner, receiveVcf, asyncHandler(async (req, res) => {
  if (!req.file || !/\.vcf$/i.test(req.file.originalname || '')) {
    throw new AppError('Choose a .vcf contacts file.', 400);
  }
  try {
    const result = await importVcf(req.file.buffer);
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error?.name === 'MongoBulkWriteError') throw error;
    throw new AppError(error.message || 'VCF import failed.', 400);
  }
}));

// Save a manually named lead, whether or not a message/call has occurred.
router.post('/manual', requirePermission('canViewWhatsapp'), asyncHandler(async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) throw new Error('Lead Name is required.');
    const result = await updatePhoneLeadName(req.body?.phone, name);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    throw new AppError(error.message || 'Cannot add lead.', 400);
  }
}));

// Rename lead only. Never mutate Customers.Customer_name or contact.name.
router.patch('/name', requirePermission('canViewWhatsapp'), asyncHandler(async (req, res) => {
  try {
    const result = req.body?.phone
      ? await updatePhoneLeadName(req.body.phone, req.body?.name)
      : await updateInstagramLeadName(req.body?.instagramId, req.body?.name);
    return res.json({ success: true, ...result });
  } catch (error) {
    throw new AppError(error.message || 'Unable to save Lead Name.', 400);
  }
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
