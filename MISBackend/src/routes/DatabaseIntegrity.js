const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const FeatureToggle = require('../repositories/featureToggle');
const {
  auditDatabaseIntegrity,
  applySafeIntegrityFixes,
} = require('../services/databaseIntegrityService');
const {
  listManualReview,
  resolveManualReview,
  searchItemOptions,
} = require('../services/databaseIntegrityManualReviewService');
const {
  searchPartyLedgers,
  searchAccountingLedgers,
  getCustomerLedger,
} = require('../services/canonicalLedgerSearchService');
const logger = require('../utils/logger');

const HISTORY_KEY = '__database_integrity_history__';
const HISTORY_LIMIT = 50;
const PARTY_ONLY_REVIEW_CATEGORIES = new Set([
  'staff_ledger_unresolved',
  'diary_assignment_unresolved',
  'bank_assignment_unresolved',
]);

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

function actorId(req) {
  return String(req.user?.User_uuid || req.user?.id || req.user?._id || '').trim();
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

router.post('/safe-fix', async (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ success: false, message: 'Explicit confirmation is required before running Safe Fix.' });
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
    logger.info({ by: actor(req), changed: result.changed, changes: result.changes }, '[database-integrity] safe fix completed');
    return res.json({ success: true, result });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] safe fix failed');
    return res.status(500).json({ success: false, message: 'Safe Fix could not complete. No destructive fallback was attempted.' });
  }
});

// Party assignment screens intentionally search only Customer Report. This
// prevents historical shadow chart-of-account rows from being selected again.
router.get('/review/party-ledger-options', async (req, res) => {
  try {
    const options = await searchPartyLedgers(req.query.q || '', req.query.limit || 40);
    return res.json({ success: true, options });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] party ledger option search failed');
    return res.status(500).json({ success: false, message: 'Could not search Customer Report ledgers.' });
  }
});

// Transaction repair may legitimately need a system/GL ledger, so it gets the
// active accounting catalog plus Customer Report, with shadow candidates removed.
router.get('/review/accounting-ledger-options', async (req, res) => {
  try {
    const options = await searchAccountingLedgers(req.query.q || '', req.query.limit || 40);
    return res.json({ success: true, options });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] accounting ledger option search failed');
    return res.status(500).json({ success: false, message: 'Could not search accounting ledgers.' });
  }
});

// Backward-compatible alias for any old UI chunk still cached in a browser.
router.get('/review/ledger-options', async (req, res) => {
  try {
    const options = await searchAccountingLedgers(req.query.q || '', req.query.limit || 40);
    return res.json({ success: true, options });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] ledger option search failed');
    return res.status(500).json({ success: false, message: 'Could not search ledgers.' });
  }
});

router.get('/review/item-options', async (req, res) => {
  try {
    const options = await searchItemOptions(req.query.q || '', req.query.limit || 40);
    return res.json({ success: true, options });
  } catch (error) {
    logger.error({ err: error }, '[database-integrity] item option search failed');
    return res.status(500).json({ success: false, message: 'Could not search catalog items.' });
  }
});

router.get('/review/:category', async (req, res) => {
  try {
    const review = await listManualReview(req.params.category, {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
    });
    return res.json({ success: true, review });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    logger.error({ err: error, category: req.params.category }, '[database-integrity] manual review load failed');
    return res.status(status).json({ success: false, message: error.message || 'Could not load manual review.' });
  }
});

router.post('/review/:category/resolve', async (req, res) => {
  try {
    if (PARTY_ONLY_REVIEW_CATEGORIES.has(req.params.category)) {
      const customer = await getCustomerLedger(req.body?.ledgerUuid);
      if (!customer) {
        return res.status(400).json({
          success: false,
          message: 'This correction must use a ledger from Customer Report. Chart-of-account/shadow records are not allowed here.',
        });
      }
    }

    const result = await resolveManualReview(
      req.params.category,
      req.body || {},
      { actor: actor(req), actorId: actorId(req) }
    );
    const report = await auditDatabaseIntegrity();
    await appendHistory({
      action: 'manual_fix',
      actor: actor(req),
      category: req.params.category,
      changed: result.changed || 0,
      note: result.message || '',
      totalIssues: report.summary.totalIssues,
      safeFixable: report.summary.safeFixable,
      manualReview: report.summary.manualReview,
    });
    logger.info(
      { by: actor(req), category: req.params.category, changed: result.changed, message: result.message },
      '[database-integrity] manual review fix completed'
    );
    return res.json({ success: true, result, report });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    logger.error({ err: error, category: req.params.category }, '[database-integrity] manual review fix failed');
    return res.status(status).json({ success: false, message: error.message || 'Could not apply the reviewed change.' });
  }
});

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
