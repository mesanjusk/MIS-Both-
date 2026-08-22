/**
 * Admin business reports — item, order, vendor and employee wise, profit by
 * period, and performance.
 *
 * Every route here is admin-only. These show the business's own margins, what
 * each supplier costs and what each person's work is worth, which is a
 * narrower audience than the rest of the reports in this app. `requireRole`
 * resolves "Admin User" to the admin tier through `utils/roleHierarchy`, so
 * the gate is the same one the rest of the backend uses rather than a second
 * idea of who counts as an admin.
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');
const logger = require('../utils/logger');
const {
  resolveRange,
  defaultGranularityFor,
  isGranularity,
  reportOffsetMinutes,
  toDateInputValue,
  RANGE_PRESETS,
  GRANULARITIES,
} = require('../utils/reportPeriods');
const {
  loadReportData,
  summarize,
  itemWise,
  orderWise,
  vendorWise,
  employeeWise,
  profitByPeriod,
  performanceByPeriod,
} = require('../services/businessReportsService');

router.use(requireAuth, requireRole('admin'));

const REPORTS = ['summary', 'items', 'orders', 'vendors', 'employees', 'performance'];

/** The filter every report reads, resolved once so all six agree. */
function readFilter(query) {
  const offsetMinutes = reportOffsetMinutes();
  const range = resolveRange(
    { preset: query.preset, from: query.from, to: query.to },
    new Date(),
    offsetMinutes
  );
  // An unreadable default beats an unreadable URL: a year at daily resolution
  // is 365 rows, so a range picks its own granularity unless one was asked for.
  const granularity = isGranularity(query.granularity)
    ? query.granularity
    : defaultGranularityFor(range);

  return { range, granularity, offsetMinutes };
}

function describeFilter({ range, granularity, offsetMinutes }) {
  return {
    preset: range.preset,
    label: range.label,
    granularity,
    from: toDateInputValue(range.from, offsetMinutes),
    // `to` is exclusive; report the inclusive last day the reader asked for.
    to: toDateInputValue(new Date(range.to.getTime() - 1), offsetMinutes),
    offsetMinutes,
  };
}

/**
 * `GET /api/reports/admin/:report`
 *
 * One endpoint per view, all reading the same params, so a table and its
 * export can never disagree about what they cover.
 */
router.get('/admin/:report', async (req, res) => {
  const report = String(req.params.report || '').toLowerCase();
  if (!REPORTS.includes(report)) {
    return res.status(400).json({
      success: false,
      message: `Unknown report "${report}". Expected one of: ${REPORTS.join(', ')}.`,
    });
  }

  try {
    const filter = readFilter(req.query);
    const { facts, truncated } = await loadReportData(filter.range, filter.offsetMinutes);

    const payload = {
      success: true,
      report,
      filter: describeFilter(filter),
      totals: summarize(facts),
      // Silence here would mean an admin acting on a total that is quietly
      // short, so the flag rides along with every response.
      truncated,
    };

    switch (report) {
      case 'items':
        payload.rows = itemWise(facts);
        break;
      case 'orders':
        payload.rows = orderWise(facts);
        break;
      case 'vendors':
        payload.rows = vendorWise(facts);
        break;
      case 'employees':
        payload.rows = employeeWise(facts);
        break;
      case 'performance':
        payload.rows = performanceByPeriod(
          facts,
          filter.range,
          filter.granularity,
          filter.offsetMinutes
        );
        break;
      case 'summary':
      default:
        payload.rows = profitByPeriod(
          facts,
          filter.range,
          filter.granularity,
          filter.offsetMinutes
        );
        // The summary leads with the totals and points at the biggest slices
        // rather than repeating all four breakdowns.
        payload.highlights = {
          items: itemWise(facts).slice(0, 5),
          vendors: vendorWise(facts).slice(0, 5),
          employees: employeeWise(facts).slice(0, 5),
        };
        break;
    }

    return res.json(payload);
  } catch (error) {
    logger.error({ err: error, report }, 'admin business report failed');
    return res.status(500).json({ success: false, message: 'Could not build the report.' });
  }
});

/** What the filter bar offers, so the client does not hard-code the list. */
router.get('/admin-options', (_req, res) => {
  res.json({
    success: true,
    reports: REPORTS,
    presets: RANGE_PRESETS,
    granularities: GRANULARITIES,
    offsetMinutes: reportOffsetMinutes(),
  });
});

module.exports = router;
