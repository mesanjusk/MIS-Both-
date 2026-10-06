const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const { auditLegacyTransactions, migrateLegacyTransactions, cleanupDuplicateLegacyImports, financialYearSummary, getLegacyTransactionDetail } = require('../services/legacyTransactionMigrationService');

router.use(requireAuth);
router.use(requireAdminOrOwner);

router.get('/audit', async (_req, res) => {
  try {
    return res.json({ success: true, result: await auditLegacyTransactions() });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Could not audit legacy transactions', result: error.audit || null });
  }
});

router.get('/financial-years', async (_req, res) => {
  try {
    return res.json({ success: true, result: await financialYearSummary() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Could not load financial-year summary' });
  }
});

router.get('/inspect/:sourceKey/:legacyId', async (req, res) => {
  try {
    const result = await getLegacyTransactionDetail(req.params.sourceKey, req.params.legacyId);
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Could not inspect legacy transaction' });
  }
});

router.post('/cleanup-duplicates', async (req, res) => {
  try {
    if (!req.body || req.body.confirmation !== 'CLEAN DUPLICATE IMPORTS') {
      return res.status(400).json({ success: false, message: 'Type CLEAN DUPLICATE IMPORTS exactly to start duplicate cleanup.' });
    }
    const result = await cleanupDuplicateLegacyImports();
    return res.json({ success: true, message: 'Duplicate legacy imports cleaned and Event_key uniqueness enforced.', result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Duplicate cleanup failed',
      result: error.unsafeGroups || null,
    });
  }
});

router.post('/migrate', async (req, res) => {
  try {
    if (req.body && req.body.confirmation !== 'MIGRATE 2025-26') {
      return res.status(400).json({ success: false, message: 'Type MIGRATE 2025-26 exactly to start the migration.' });
    }
    if (!req.body || req.body.confirmation !== 'MIGRATE 2025-26') {
      return res.status(400).json({ success: false, message: 'Type MIGRATE 2025-26 exactly to start the migration.' });
    }
    const result = await migrateLegacyTransactions({ maxWrites: 50 });
    return res.json({ success: true, message: 'Legacy transactions migrated into the unified transactions collection.', result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Migration failed', result: error.audit || error.results || null });
  }
});

module.exports = router;
