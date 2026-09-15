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

let tail = [];
let cursor = null;
let warmed = false;
let inFlight = null;

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
  let since = null;

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

  inFlight = (async () => {
    if (warmed) {
      await catchUp();
      return;
    }
    await walkToEnd();
    warmed = true;
  })()
    .catch((error) => {
      // A failed warm must not latch: leave `warmed` false so the next call
      // retries the walk instead of serving an empty tail forever.
      logger.error({ err: error.message }, '[sanjusk-inbox] refresh failed');
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
};

module.exports = { getRecentMessages, resetCache, PROVIDER_MAX_LIMIT, MAX_WALK_PAGES, TAIL_SIZE };
