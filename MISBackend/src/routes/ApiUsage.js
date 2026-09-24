/**
 * The API performance report, and the switches that go with it.
 *
 * Admin-only: it lists every endpoint the server has, how heavily each is
 * used and how well it performs, and lets an administrator switch one off.
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');
const logger = require('../utils/logger');
const ApiUsage = require('../repositories/apiUsage');
const FeatureToggle = require('../repositories/featureToggle');
const { collectRoutes, groupOf } = require('../utils/routeInventory');
const { flush } = require('../middleware/apiUsage');
const { invalidate, isProtected } = require('../middleware/featureToggle');
const { PAGES } = require('../constants/frontendPages');
const { DEFAULT_DISABLED_KEYS } = require('../constants/defaultFeatureToggles');
const DatabaseIntegrityRouter = require('./DatabaseIntegrity');

router.use(requireAuth);

const DEFAULT_IDLE_DAYS = 45;

async function observationStart() {
  const earliest = await ApiUsage.findOne({}).sort({ firstSeenAt: 1 }).select('firstSeenAt').lean();
  return earliest?.firstSeenAt || null;
}

router.get('/report', requireRole('admin'), async (req, res) => {
  try {
    const idleDays = Math.max(1, Math.min(365, Number(req.query.idleDays) || DEFAULT_IDLE_DAYS));
    const idleBefore = new Date(Date.now() - idleDays * 24 * 60 * 60 * 1000);

    await flush().catch(() => {});

    const [routes, usageRows, toggleRows, since] = await Promise.all([
      Promise.resolve(collectRoutes(req.app)),
      ApiUsage.find({}).lean(),
      FeatureToggle.find({}).lean(),
      observationStart(),
    ]);

    const usage = new Map(usageRows.map((row) => [row.key, row]));
    const toggles = new Map(toggleRows.map((row) => [row.key, row]));

    const apis = routes.map((route) => {
      const stat = usage.get(route.key);
      const toggle = toggles.get(route.key);
      const hits = stat?.hits || 0;
      const errors = (stat?.status5xx || 0) + (stat?.status4xx || 0);

      return {
        key: route.key,
        method: route.method,
        path: route.path,
        group: groupOf(route.path),
        hits,
        lastUsedAt: stat?.lastUsedAt || null,
        avgMs: hits > 0 ? Math.round((stat.totalMs / hits) * 10) / 10 : null,
        maxMs: stat?.maxMs || null,
        errorRate: hits > 0 ? errors / hits : null,
        status5xx: stat?.status5xx || 0,
        idle: !stat?.lastUsedAt || new Date(stat.lastUsedAt) < idleBefore,
        neverCalled: !stat?.lastUsedAt,
        disabled: Boolean(toggle?.disabled),
        disabledBy: toggle?.disabledBy || '',
        note: toggle?.note || '',
        defaultOff: DEFAULT_DISABLED_KEYS.has(route.key),
        locked: isProtected(route.path),
      };
    });

    const pages = PAGES.map((page) => {
      const toggle = toggles.get(page.path);
      return {
        key: page.path,
        path: page.path,
        label: page.label,
        linked: page.linked !== false,
        disabled: Boolean(toggle?.disabled),
        disabledBy: toggle?.disabledBy || '',
        note: toggle?.note || '',
        defaultOff: DEFAULT_DISABLED_KEYS.has(page.path),
        locked: Boolean(page.locked),
      };
    });

    const called = apis.filter((api) => api.hits > 0);
    const slowest = [...called].sort((a, b) => b.avgMs - a.avgMs).slice(0, 10);
    const busiest = [...called].sort((a, b) => b.hits - a.hits).slice(0, 10);
    const failing = called.filter((api) => api.errorRate > 0).sort((a, b) => b.errorRate - a.errorRate).slice(0, 10);

    return res.json({
      success: true,
      idleDays,
      observedSince: since,
      observedDays: since ? Math.floor((Date.now() - new Date(since)) / 86_400_000) : 0,
      totals: {
        endpoints: apis.length,
        called: called.length,
        neverCalled: apis.filter((a) => a.neverCalled).length,
        idle: apis.filter((a) => a.idle).length,
        disabled: apis.filter((a) => a.disabled).length,
        pages: pages.length,
        pagesDisabled: pages.filter((p) => p.disabled).length,
      },
      highlights: { slowest, busiest, failing },
      apis,
      pages,
    });
  } catch (error) {
    logger.error({ err: error }, 'api usage report failed');
    return res.status(500).json({ success: false, message: 'Could not build the report.' });
  }
});

router.post('/toggle', requireRole('admin'), async (req, res) => {
  try {
    const { key, kind, disabled, note } = req.body || {};

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, message: 'A key is required.' });
    }
    if (kind !== 'api' && kind !== 'page') {
      return res.status(400).json({ success: false, message: 'kind must be "api" or "page".' });
    }

    const path = kind === 'api' ? key.slice(key.indexOf(' ') + 1) : key;
    if (kind === 'api' && isProtected(path)) {
      return res.status(400).json({
        success: false,
        message: `${path} keeps the app reachable and cannot be switched off.`,
      });
    }

    const off = Boolean(disabled);
    const who = req.user?.User_name || req.user?.userName || req.user?.User_uuid || 'an admin';

    await FeatureToggle.findOneAndUpdate(
      { key },
      {
        $set: {
          kind,
          disabled: off,
          disabledAt: off ? new Date() : null,
          disabledBy: off ? who : '',
          note: typeof note === 'string' ? note.slice(0, 500) : '',
        },
      },
      { upsert: true, new: true }
    );

    if (kind === 'api') await invalidate();

    logger.info({ key, kind, disabled: off, by: who }, 'feature toggle changed');
    return res.json({ success: true, key, kind, disabled: off });
  } catch (error) {
    logger.error({ err: error }, 'feature toggle update failed');
    return res.status(500).json({ success: false, message: 'Could not save that change.' });
  }
});

router.get('/toggles', async (_req, res) => {
  try {
    const rows = await FeatureToggle.find({ disabled: true }).select('key kind').lean();
    return res.json({
      success: true,
      apis: rows.filter((r) => r.kind === 'api').map((r) => r.key),
      pages: rows.filter((r) => r.kind === 'page').map((r) => r.key),
    });
  } catch (error) {
    logger.error({ err: error }, 'toggle list failed');
    return res.status(500).json({ success: false, message: 'Could not read the switches.' });
  }
});

// Reuse this already-mounted admin router so the integrity feature does not
// need another top-level index.js registration. The child router repeats auth
// and applies the stricter Admin/Owner guard to every integrity action.
router.use('/database-integrity', DatabaseIntegrityRouter);

module.exports = router;
