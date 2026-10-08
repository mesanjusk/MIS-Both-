const sanjusk = require('./sanjuskApiService');
const logger = require('../utils/logger');

/**
 * Reads the newest messages out of the SanjuSK API for the Home → Inbox.
 *
 * The provider's GET /api/v1/messages is a forward cursor, not a "latest N"
 * query: it sorts ascending by createdAt, applies `limit`, and pages with
 * `since` (strictly greater than). Asked without a `since`, it therefore
 * returns the OLDEST rows the account has ever had — so the inbox, which
 * polled exactly that way every five seconds, sat frozen on the first page of
 * history and never showed anything recent once the account passed `limit`
 * messages. Both directions, which is why neither incoming nor outgoing
 * appeared.
 *
 * There is no ordering parameter to fix that with, so reaching the newest
 * messages means walking the cursor to the end. Doing that on every poll would
 * turn one request into one-per-page and blow through the provider's 120/min
 * budget, so the walk happens once and the tail is kept: afterwards each
 * refresh is a single request for whatever arrived since the last one, which
 * is the same cost as the broken version.
 *
 * The cache is process-local and purely an accelerator — losing it (restart,
 * redeploy) costs one re-walk, never correctness.
 */

// The provider caps `limit` at 200 and silently clamps above it.
const PROVIDER_MAX_LIMIT = 200;

// 50 pages × 200 = 10,000 messages of history before the walk gives up. A cold
// start on a larger account lands on the newest 10,000, which is far more than
// an inbox shows.
const MAX_WALK_PAGES = 50;

// How many messages to keep in memory. The UI asks for at most 100.
const TAIL_SIZE = 500;

// Multiple Home tabs plus the attendance worker can ask for the same tail in
// quick succession. A short freshness window collapses those reads into one
// provider request while keeping the inbox/attendance near-real-time.
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;
const COLD_START_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 2 * 60 * 1000;

let tail = [];
let cursor = null;
let warmed = false;
let inFlight = null;
let lastRefreshAt = 0;
let rateLimitedUntil = 0;

const rowsOf = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const idOf = (row = {}) =>
  String(row.id || row._id || row.messageId || row.wamid || '') ||
  `${row.timestamp || row.createdAt || ''}:${row.from || ''}:${row.text || row.body || ''}`;

const fetchPage = (since) =>
  sanjusk.listMessages({
    since: since || undefined,
    limit: PROVIDER_MAX_LIMIT,
    requireEnabled: false,
  });

/**
 * Appends a page, dropping anything already held. `since` is exclusive on the
 * provider side, so duplicates should not arrive — but an id-keyed merge costs
 * nothing and keeps a repeated or retried page from doubling rows in the UI.
 */
const appendRows = (rows) => {
  if (!rows.length) return;

  const seen = new Set(tail.map(idOf));
  for (const row of rows) {
    const id = idOf(row);
    if (seen.has(id)) continue;
    seen.add(id);
    tail.push(row);
  }

  if (tail.length > TAIL_SIZE) tail = tail.slice(-TAIL_SIZE);
};

const advanceCursor = (payload, rows) => {
  const next = payload?.nextSince;
  if (next) {
    cursor = next;
    return;
  }
  const last = rows[rows.length - 1];
  const stamp = last?.createdAt || last?.timestamp;
  if (stamp) cursor = new Date(stamp).toISOString();
};

/** Cold start: page forward until the provider says there is no more. */
const walkToEnd = async () => {
  let pages = 0;
  // The provider supports an arbitrary `since` cursor. Starting at the
  // beginning of all history is unnecessary for the live inbox and can burn
  // the request budget before recent messages are reached. Warm from the last
  // 24 hours, and resume from the saved cursor after a partial/failed walk.
  let since = cursor || new Date(Date.now() - COLD_START_LOOKBACK_MS).toISOString();

  for (;;) {
    const payload = await fetchPage(since);
    const rows = rowsOf(payload);
    appendRows(rows);
    advanceCursor(payload, rows);
    pages += 1;

    if (!payload?.hasMore || !rows.length) break;
    if (pages >= MAX_WALK_PAGES) {
      logger.warn({ pages }, '[sanjusk-inbox] stopped walking history at the page cap');
      break;
    }
    since = cursor;
  }

  logger.info({ pages, kept: tail.length }, '[sanjusk-inbox] warmed conversation tail');
};

/** Steady state: one request for whatever is new, following any backlog. */
const catchUp = async () => {
  let pages = 0;

  for (;;) {
    const payload = await fetchPage(cursor);
    const rows = rowsOf(payload);
    appendRows(rows);
    advanceCursor(payload, rows);
    pages += 1;

    if (!payload?.hasMore || !rows.length) break;
    if (pages >= MAX_WALK_PAGES) break;
  }
};

/**
 * Brings the tail up to date. Concurrent callers share one refresh — the
 * inbox polls every five seconds from every open tab, and letting those stack
 * would multiply provider calls for identical data.
 */
const refresh = async () => {
  if (inFlight) return inFlight;
  if (Date.now() < rateLimitedUntil) return;
  if (warmed && Date.now() - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;

  inFlight = (async () => {
    if (warmed) {
      await catchUp();
      lastRefreshAt = Date.now();
      return;
    }
    await walkToEnd();
    warmed = true;
    lastRefreshAt = Date.now();
  })()
    .catch((error) => {
      // Keep the cursor already reached so the next attempt resumes instead of
      // restarting from old history. Back off hard on provider 429s so Inbox
      // cannot starve operational attendance sends.
      const isRateLimited =
        Number(error?.statusCode || error?.status) === 429 ||
        /rate limit/i.test(String(error?.message || ''));
      if (isRateLimited) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        logger.warn(
          { retryAfterMs: RATE_LIMIT_BACKOFF_MS },
          '[sanjusk-inbox] provider rate limited; backing off'
        );
      } else {
        logger.error({ err: error.message }, '[sanjusk-inbox] refresh failed');
      }
      throw error;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/**
 * The newest `limit` messages, oldest-first — the order the inbox renders and
 * the same order the provider returns, so nothing downstream changes.
 */
const getRecentMessages = async ({ limit = 100 } = {}) => {
  await refresh();
  const size = Math.min(Math.max(1, Number(limit) || 100), TAIL_SIZE);
  return { rows: tail.slice(-size), nextSince: cursor };
};

/** Test seam. */
const resetCache = () => {
  tail = [];
  cursor = null;
  warmed = false;
  inFlight = null;
  lastRefreshAt = 0;
  rateLimitedUntil = 0;
};

module.exports = { getRecentMessages, resetCache, PROVIDER_MAX_LIMIT, MAX_WALK_PAGES, TAIL_SIZE, MIN_REFRESH_INTERVAL_MS };

// WhatsApp attendance must not depend on Home → Inbox being open. This module
// is loaded by the WhatsApp routes on every backend process, so start the
// background poller once after module initialization. Tests keep explicit
// control of timers by skipping the automatic scheduler in NODE_ENV=test.
if (process.env.NODE_ENV !== 'test') {
  setImmediate(() => {
    try {
      require('./sanjuskAttendancePoller').initSanjuskAttendancePoller();
    } catch (error) {
      logger.error({ err: error?.message || error }, '[sanjusk-attendance-poller] failed to start');
    }
  });
}
