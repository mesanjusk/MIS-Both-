/**
 * Period bucketing for the admin business reports.
 *
 * Pure functions only — no Mongoose, no `new Date()` a caller cannot override —
 * so the arithmetic behind every report is testable without a database and
 * cannot disagree between the API and anything else that reads it.
 *
 * Reports are read in the studio's timezone, which is not the server's. Render
 * runs in UTC, so an order taken at 1am IST would otherwise land in the
 * previous day's column for everyone looking at it. Every boundary below is
 * computed after shifting into this offset and shifted back before it is used
 * in a query, so "Monday" means Monday where the business is.
 */

const GRANULARITIES = ['daily', 'weekly', 'monthly'];

/** Minutes east of UTC. IST by default; override with REPORTS_UTC_OFFSET_MINUTES. */
const DEFAULT_UTC_OFFSET_MINUTES = 330;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function reportOffsetMinutes(raw = process.env.REPORTS_UTC_OFFSET_MINUTES) {
  if (!raw) return DEFAULT_UTC_OFFSET_MINUTES;
  const parsed = Number(raw);
  // A malformed override silently switching every report to UTC would be a
  // very quiet way to be wrong, but so would crashing the page.
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 16 * 60) return DEFAULT_UTC_OFFSET_MINUTES;
  return Math.trunc(parsed);
}

const isGranularity = (value) => GRANULARITIES.includes(value);

/** The instant, seen as a wall clock in the report timezone. */
const toLocal = (date, offsetMinutes) => new Date(date.getTime() + offsetMinutes * MS_PER_MINUTE);

/** A wall clock in the report timezone, back to a real instant. */
const fromLocal = (local, offsetMinutes) => new Date(local.getTime() - offsetMinutes * MS_PER_MINUTE);

/**
 * The first instant of the bucket `date` falls into. Weeks start on Monday,
 * which is how a working week is counted here.
 */
function startOfPeriod(date, granularity, offsetMinutes = reportOffsetMinutes()) {
  const local = toLocal(date, offsetMinutes);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  if (granularity === 'monthly') {
    return fromLocal(new Date(Date.UTC(year, month, 1)), offsetMinutes);
  }

  const midnight = Date.UTC(year, month, day);
  if (granularity === 'daily') return fromLocal(new Date(midnight), offsetMinutes);

  // getUTCDay() is 0 for Sunday, which is 6 days into a Monday-first week.
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return fromLocal(new Date(midnight - daysSinceMonday * MS_PER_DAY), offsetMinutes);
}

/** The first instant of the bucket after the one `date` falls into. */
function endOfPeriod(date, granularity, offsetMinutes = reportOffsetMinutes()) {
  const start = startOfPeriod(date, granularity, offsetMinutes);
  if (granularity === 'monthly') {
    const local = toLocal(start, offsetMinutes);
    return fromLocal(
      new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1)),
      offsetMinutes
    );
  }
  return new Date(start.getTime() + (granularity === 'weekly' ? 7 : 1) * MS_PER_DAY);
}

/**
 * ISO-8601 week key. The year in `2026-W01` is the *week's* year, not always
 * the date's: 1 January 2027 falls in week 53 of 2026, and labelling it
 * `2027-W53` would sort a December row after the following December.
 */
function isoWeekKey(localMonday) {
  const thursday = new Date(localMonday.getTime() + 3 * MS_PER_DAY);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstMonday = new Date(
    firstThursday.getTime() - ((firstThursday.getUTCDay() + 6) % 7) * MS_PER_DAY
  );
  const week = Math.round((localMonday.getTime() - firstMonday.getTime()) / (7 * MS_PER_DAY)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Sortable, stable key for a bucket: `2026-08-22`, `2026-W34`, `2026-08`.
 * Used as a map key and as the export's period column, so it must not depend
 * on the reader's locale.
 */
function periodKey(date, granularity, offsetMinutes = reportOffsetMinutes()) {
  const local = toLocal(startOfPeriod(date, granularity, offsetMinutes), offsetMinutes);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');

  if (granularity === 'monthly') return `${year}-${month}`;
  if (granularity === 'daily') return `${year}-${month}-${day}`;
  return isoWeekKey(local);
}

/** What the row header says: `22 Aug 2026`, `Week of 17 Aug 2026`, `Aug 2026`. */
function periodLabel(start, granularity, offsetMinutes = reportOffsetMinutes()) {
  const local = toLocal(start, offsetMinutes);
  const day = local.getUTCDate();
  const month = MONTHS[local.getUTCMonth()];
  const year = local.getUTCFullYear();

  if (granularity === 'monthly') return `${month} ${year}`;
  if (granularity === 'daily') return `${day} ${month} ${year}`;
  return `Week of ${day} ${month} ${year}`;
}

/** `2026-08-22` in the report timezone — the shape a date input wants. */
function toDateInputValue(date, offsetMinutes = reportOffsetMinutes()) {
  const local = toLocal(date, offsetMinutes);
  return [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, '0'),
    String(local.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** `YYYY-MM-DD` in the report timezone, as the instant that day begins. */
function fromDateInputValue(raw, offsetMinutes = reportOffsetMinutes()) {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw).trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = fromLocal(new Date(Date.UTC(+year, +month - 1, +day)), offsetMinutes);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Every bucket start from `from` to `to`, inclusive of the bucket `to` falls
 * in. Reports iterate this rather than the rows, so a day with no orders
 * prints a zero rather than vanishing — a gap in a trend reads as "we lost the
 * data", a zero reads as "we sold nothing".
 */
function periodStarts(from, to, granularity, offsetMinutes = reportOffsetMinutes()) {
  if (to.getTime() < from.getTime()) return [];

  const starts = [];
  let cursor = startOfPeriod(from, granularity, offsetMinutes);
  const last = startOfPeriod(to, granularity, offsetMinutes).getTime();

  // A year of days is 365 rows. The cap only stops a hand-typed
  // `from=1970-01-01&granularity=daily` from allocating forever.
  const MAX_BUCKETS = 4000;
  while (cursor.getTime() <= last && starts.length < MAX_BUCKETS) {
    starts.push(cursor);
    cursor = endOfPeriod(cursor, granularity, offsetMinutes);
  }
  return starts;
}

const RANGE_PRESETS = ['today', '7d', '30d', '90d', 'this-month', 'last-month', '12m', 'all'];
const DEFAULT_PRESET = '30d';

const RANGE_PRESET_LABELS = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  'this-month': 'This month',
  'last-month': 'Last month',
  '12m': 'Last 12 months',
  all: 'All time',
};

/**
 * The range a set of query params asks for. `from` is inclusive, `to` is
 * exclusive — the half-open form every Mongo range query wants.
 *
 * An explicit from/to pair beats the preset, so a bookmarked custom range
 * survives a reload. Anything unparseable falls back to the default rather
 * than erroring: a report that refuses to render because someone fat-fingered
 * a URL is not a useful report.
 */
function resolveRange(params = {}, now = new Date(), offsetMinutes = reportOffsetMinutes()) {
  const customFrom = fromDateInputValue(params.from, offsetMinutes);
  const customTo = fromDateInputValue(params.to, offsetMinutes);

  if (customFrom && customTo) {
    const forward = customFrom <= customTo;
    const start = forward ? customFrom : customTo;
    const endInclusive = forward ? customTo : customFrom;
    // Both ends are inclusive dates as typed; `to` becomes exclusive by moving
    // to the following midnight, so "22nd to 22nd" is a whole day.
    return {
      from: start,
      to: new Date(endInclusive.getTime() + MS_PER_DAY),
      preset: 'custom',
      label: `${toDateInputValue(start, offsetMinutes)} → ${toDateInputValue(endInclusive, offsetMinutes)}`,
    };
  }

  const preset = RANGE_PRESETS.includes(params.preset) ? params.preset : DEFAULT_PRESET;
  const tomorrow = endOfPeriod(now, 'daily', offsetMinutes);
  const daysBack = (count) => new Date(tomorrow.getTime() - count * MS_PER_DAY);
  const label = RANGE_PRESET_LABELS[preset];

  switch (preset) {
    case 'today':
      return { from: startOfPeriod(now, 'daily', offsetMinutes), to: tomorrow, preset, label };
    case '7d':
      return { from: daysBack(7), to: tomorrow, preset, label };
    case '90d':
      return { from: daysBack(90), to: tomorrow, preset, label };
    case 'this-month':
      return { from: startOfPeriod(now, 'monthly', offsetMinutes), to: tomorrow, preset, label };
    case 'last-month': {
      const to = startOfPeriod(now, 'monthly', offsetMinutes);
      return {
        from: startOfPeriod(new Date(to.getTime() - 1), 'monthly', offsetMinutes),
        to,
        preset,
        label,
      };
    }
    case '12m': {
      const thisMonth = toLocal(startOfPeriod(now, 'monthly', offsetMinutes), offsetMinutes);
      return {
        from: fromLocal(
          new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 11, 1)),
          offsetMinutes
        ),
        to: tomorrow,
        preset,
        label,
      };
    }
    case 'all':
      // Before this business had a database, and so before any row in it.
      return { from: new Date(0), to: tomorrow, preset, label };
    case '30d':
    default:
      return { from: daysBack(30), to: tomorrow, preset, label: RANGE_PRESET_LABELS['30d'] };
  }
}

/**
 * The granularity a range can actually be read at. A year at daily resolution
 * is 365 unreadable rows, so a wide range picks something coarser unless the
 * caller asked for one.
 */
function defaultGranularityFor(range) {
  const spanDays = (range.to.getTime() - range.from.getTime()) / MS_PER_DAY;
  if (spanDays <= 14) return 'daily';
  if (spanDays <= 92) return 'weekly';
  return 'monthly';
}

module.exports = {
  GRANULARITIES,
  DEFAULT_UTC_OFFSET_MINUTES,
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  DEFAULT_PRESET,
  reportOffsetMinutes,
  isGranularity,
  startOfPeriod,
  endOfPeriod,
  periodKey,
  periodLabel,
  periodStarts,
  toDateInputValue,
  fromDateInputValue,
  resolveRange,
  defaultGranularityFor,
};
