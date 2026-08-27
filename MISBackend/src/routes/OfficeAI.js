const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { getBusinessControlSummary } = require('../services/businessWorkflowService');
const {
  getTeamStatus,
  getDailyReport,
  getEscalations,
} = require('../services/operationsTaskService');
const {
  OFFICE_AI_MODE,
  providerInfo,
  buildOfficeSnapshot,
  generateOfficeBrief,
  answerOfficeQuestion,
} = require('../services/officeAiService');
const { parseCustomerEnquiry, prepareQuote } = require('../services/customerAiService');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireAuth, requireAdmin);

async function loadSnapshot() {
  const [businessSummary, teamStatus, dailyReport, escalations] = await Promise.all([
    getBusinessControlSummary(),
    getTeamStatus(),
    getDailyReport(),
    getEscalations(),
  ]);
  return buildOfficeSnapshot({ businessSummary, teamStatus, dailyReport, escalations });
}

router.get('/status', (_req, res) => {
  res.json({
    success: true,
    result: {
      ...providerInfo(),
      mode: OFFICE_AI_MODE,
      canWrite: false,
      dataSources: ['Business Control', 'Orders', 'Vendor Ledger', 'Team Operations', 'Attendance', 'User Tasks', 'Rate Cards'],
    },
  });
});

router.get('/brief', async (_req, res) => {
  try {
    const snapshot = await loadSnapshot();
    const brief = await generateOfficeBrief(snapshot);
    res.json({ success: true, result: { snapshot, brief } });
  } catch (error) {
    logger.error({ err: error?.message }, '[office-ai] failed to build brief');
    res.status(500).json({ success: false, message: 'Failed to build Office AI brief' });
  }
});

router.post('/ask', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ success: false, message: 'Question is required' });
  if (question.length > 1200) return res.status(400).json({ success: false, message: 'Question is too long (maximum 1200 characters)' });
  try {
    const snapshot = await loadSnapshot();
    const result = await answerOfficeQuestion({ question, snapshot });
    return res.json({ success: true, result: { ...result, snapshotGeneratedAt: snapshot.generatedAt } });
  } catch (error) {
    logger.error({ err: error?.message }, '[office-ai] failed to answer question');
    return res.status(500).json({ success: false, message: 'Office AI could not answer this question' });
  }
});

// Customer AI v1 is deliberately prepare-only. It does not send WhatsApp
// messages and does not create/mutate an order. The operator reviews first.
router.post('/customer/parse', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ success: false, message: 'Customer message is required' });
  if (message.length > 3000) return res.status(400).json({ success: false, message: 'Customer message is too long' });
  try {
    const result = await parseCustomerEnquiry(message);
    return res.json({ success: true, result });
  } catch (error) {
    logger.error({ err: error?.message }, '[customer-ai] parse failed');
    return res.status(500).json({ success: false, message: 'Customer AI could not parse this enquiry' });
  }
});

router.post('/customer/quote', async (req, res) => {
  const requirement = req.body?.requirement || {};
  const rateCardUuid = String(req.body?.rateCardUuid || '').trim();
  if (!rateCardUuid) return res.status(400).json({ success: false, message: 'rateCardUuid is required' });
  try {
    const result = await prepareQuote(requirement, rateCardUuid);
    return res.json({ success: true, result: { ...result, mode: 'prepare_only', canSend: false, canCreateOrder: false } });
  } catch (error) {
    logger.error({ err: error?.message }, '[customer-ai] quote preparation failed');
    return res.status(500).json({ success: false, message: 'Could not prepare quote' });
  }
});

module.exports = router;
