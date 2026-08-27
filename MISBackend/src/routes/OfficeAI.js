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
const logger = require('../utils/logger');

const router = express.Router();

// Office AI v1 is intentionally management-only and read-only. The AI never
// receives a route capable of mutating orders, payments, assignments or users.
router.use(requireAuth, requireAdmin);

async function loadSnapshot() {
  const [businessSummary, teamStatus, dailyReport, escalations] = await Promise.all([
    getBusinessControlSummary(),
    getTeamStatus(),
    getDailyReport(),
    getEscalations(),
  ]);

  return buildOfficeSnapshot({
    businessSummary,
    teamStatus,
    dailyReport,
    escalations,
  });
}

router.get('/status', (_req, res) => {
  res.json({
    success: true,
    result: {
      ...providerInfo(),
      mode: OFFICE_AI_MODE,
      canWrite: false,
      dataSources: [
        'Business Control',
        'Orders',
        'Vendor Ledger',
        'Team Operations',
        'Attendance',
        'User Tasks',
      ],
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
  if (!question) {
    return res.status(400).json({ success: false, message: 'Question is required' });
  }
  if (question.length > 1200) {
    return res.status(400).json({ success: false, message: 'Question is too long (maximum 1200 characters)' });
  }

  try {
    const snapshot = await loadSnapshot();
    const result = await answerOfficeQuestion({ question, snapshot });
    return res.json({ success: true, result: { ...result, snapshotGeneratedAt: snapshot.generatedAt } });
  } catch (error) {
    logger.error({ err: error?.message }, '[office-ai] failed to answer question');
    return res.status(500).json({ success: false, message: 'Office AI could not answer this question' });
  }
});

module.exports = router;
