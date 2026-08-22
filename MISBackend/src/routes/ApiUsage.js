/**
 * The API performance report, and the switches that go with it.
 *
 * Admin-only: it lists every endpoint the server has, how heavily each is
 * used and how well it performs, and lets an administrator switch one off.
 * That is enough to take the app apart, so it sits behind the same
 * `requireRole('admin')` — "Admin User" — as the business reports.
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

// Everything here needs a login. The report and the switches additionally
// need admin — they expose the whole route table and can take endpoints
// offline. `/toggles` deliberately does not: every signed-in user's app needs
// to know which pages are hidden, and a list of switched-off paths gives away
// nothing that the navigation would not.
router.use(requireAuth);

/** How long an endpoint must go untouched to count as unused. */
const DEFAULT_IDLE_DAYS = 45;

/**
 * The report is only as old as the telemetry. Recording started when this
 * shipped, so until 45 days have passed "unused for 45 days" cannot be
 * distinguished from "we have not been watching for 45 days" — and the
 * response says which, rather than letting the screen imply the stronger
 * claim.
 */
async function observationStart() {
  const earliest = await ApiUsage.findOne({}).sort({ firstSeenAt: 1 }).select('firstSeenAt').lean();
  return earliest?.firstSeenAt || null;
}

/**
 * `GET /api/api-usage/report`
 *
 * Every route the server serves, joined to its usage and its switch.
 * Endpoints with no usage row have genuinely never been called since
 * recording began — which is different from never being called.
 */
router.get('/report', requireRole('admin'), async (req, res) => {
  try {
    const idleDays = Math.max(1, Math.min(365, Number(req.query.idleDays) || DEFAULT_IDLE_DAYS));
    const idleBefore = new Date(Date.now() - idleDays * 24 * 60 * 60 * 1000);

    // Flush first, so a report opened right after using the app reflects it.
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
        // Never called at all, or not since the cut-off.
        idle: !stat?.lastUsedAt || new Date(stat.lastUsedAt) < idleBefore,
        neverCalled: !stat?.lastUsedAt,
        disabled: Boolean(toggle?.disabled),
        disabledBy: toggle?.disabledBy || '',
        // A protected endpoint shows in the list but cannot be switched off,
        // so the UI can grey the box rather than fail the click.
        locked: isProtected(route.path),
      };
    });

    const pages = PAGES.map((page) => {
      const toggle = toggles.get(page.path);
      return {
        key: page.path,
        path: page.path,
        label: page.label,
        // Whether any menu points at it. Short of real traffic this is the
        // strongest hint that a page is unused — an unlinked page can only be
        // reached by typing its URL.
        linked: page.linked !== false,
        // Pages are React routes; the server never sees them, so there is no
        // hit count to report. Their switch still works.
        disabled: Boolean(toggle?.disabled),
        disabledBy: toggle?.disabledBy || '',
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
      // Days of telemetry actually collected. Below `idleDays` the "unused"
      // column is provisional, and the client says so.
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

/**
 * `POST /api/api-usage/toggle` — switch one endpoint or page on or off.
 *
 * Body: `{ key, kind: 'api'|'page', disabled: boolean, note? }`
 */
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
      // The lockout guard. Refused here as well as in the middleware so the
      // row never even reaches the database looking switched off.
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

/** `GET /api/api-usage/toggles` — just the switches, for the frontend to gate pages. */
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

module.exports = router;
