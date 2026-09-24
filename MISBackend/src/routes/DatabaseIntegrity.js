const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const FeatureToggle = require('../repositories/featureToggle');
const {
  auditDatabaseIntegrity,
  applySafeIntegrityFixes,
} = require('../services/databaseIntegrityService');
const logger = require('../utils/logger');

const HISTORY_KEY = '__database_integrity_history__';
const HISTORY_LIMIT = 50;

router.use(requireAuth);
router.use(requireAdminOrOwner);

function actor(req) {
  return String(
    req.user?.User_name ||
    req.user?.userName ||
    req.user?.name ||
    req.user?.User_uuid ||
    req.user?.id ||
    'admin'
  ).trim();
}

async function appendHistory(entry) {
  await FeatureToggle.findOneAndUpdate(
    { key: HISTORY_KEY },
    {
      $setOnInsert: {
        key: HISTORY_KEY,
        kind: 'system',
        disabled: false,
        note: 'Bounded Database Integrity run history',
      },
      $push: {
        systemHistory: {
          $each: [{ ...entry, at: new Date() }],
          $slice: -HISTORY_LIMIT,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * GET /api/database-integrity/audit
 *
 * Read-only against business collections. The only write is one small audit
 * metadata entry recording who ran the check and its summary; no customer,
 * transaction, attendance, order, ledger or other business record is changed.
 */
router.get('/audit', async (req, res) => {
  try {
    const report = await auditDatabaseIntegrity();
    await appendHistory({
      action: 'audit',
      actor: actor(req),
      changed: 0,
      totalIssues: report.summary.totalIssues,
      safeFixable: report.summary.safeFixable,
      manualReview: report.summary.manualReview,
    });
    logger.info({ by: actor(req), summary: report.summary }, '[database-integrity] audit completed');
    return res.json({ success: true, report });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] audit failed');
    return res.status(500).json({ success: false, message: 'Could not complete database integrity audit.' });
  }
});

/**
 * POST /api/database-integrity/safe-fix
 * Body must include { confirm: true }.
 *
 * This intentionally exposes no delete/merge/renumber operation. The service
 * only fills missing additive identity fields when a match is unambiguous and
 * never edits transaction journals.
 */
router.post('/safe-fix', async (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Explicit confirmation is required before running Safe Fix.',
    });
  }

  try {
    const result = await applySafeIntegrityFixes();
    await appendHistory({
      action: 'safe_fix',
      actor: actor(req),
      changed: result.changed,
      changes: result.changes,
      totalIssues: result.report.summary.totalIssues,
      safeFixable: result.report.summary.safeFixable,
      manualReview: result.report.summary.manualReview,
    });
    logger.info(
      { by: actor(req), changed: result.changed, changes: result.changes },
      '[database-integrity] safe fix completed'
    );
    return res.json({ success: true, result });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] safe fix failed');
    return res.status(500).json({ success: false, message: 'Safe Fix could not complete. No destructive fallback was attempted.' });
  }
});

/** GET /api/database-integrity/history */
router.get('/history', async (_req, res) => {
  try {
    const row = await FeatureToggle.findOne({ key: HISTORY_KEY }).select('systemHistory').lean();
    const history = Array.isArray(row?.systemHistory) ? [...row.systemHistory].reverse() : [];
    return res.json({ success: true, history });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] history read failed');
    return res.status(500).json({ success: false, message: 'Could not load integrity history.' });
  }
});

module.exports = router;
