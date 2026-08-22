const ApiUsage = require('../repositories/apiUsage');
const logger = require('../utils/logger');

/**
 * Records which endpoints are called, how fast they answer and how often they
 * fail.
 *
 * Buffered on purpose. A database write per request would make every endpoint
 * slower in order to measure how slow endpoints are, which is self-defeating
 * on a free instance. Instead each request adds to an in-memory tally and the
 * whole tally is flushed in one `bulkWrite` every `FLUSH_MS`, using `$inc` so
 * two instances flushing at once add up rather than overwrite.
 *
 * What that costs: up to one flush window of counts is lost if the process
 * dies, and Render restarts these regularly. That is the right trade — this
 * data answers "has anyone touched this endpoint in 45 days", and a handful of
 * missed hits never changes that answer. It is not billing data.
 */

const FLUSH_MS = Number(process.env.API_USAGE_FLUSH_MS || 30_000);

/** key -> tally */
let buffer = new Map();
let timer = null;
let flushing = false;

/**
 * The route template, not the URL that was requested.
 *
 * `req.route.path` is only set once a route has matched, and it is relative to
 * its router — `req.baseUrl` supplies the mount. A request that matched
 * nothing (404) has neither, and is deliberately not recorded: unmatched URLs
 * are unbounded and mostly scanners.
 */
function routeKeyOf(req) {
  if (!req.route?.path) return null;
  const path = `${req.baseUrl || ''}${req.route.path === '/' ? '' : req.route.path}`;
  const normalized = `/${path.replace(/^\/+|\/+$/g, '')}`.replace(/\/+/g, '/');
  return `${req.method} ${normalized === '/' ? '/' : normalized}`;
}

function record(key, method, path, durationMs, status) {
  let entry = buffer.get(key);
  if (!entry) {
    entry = {
      method,
      path,
      hits: 0,
      totalMs: 0,
      maxMs: 0,
      status2xx: 0,
      status3xx: 0,
      status4xx: 0,
      status5xx: 0,
      lastStatus: status,
      lastUsedAt: new Date(),
    };
    buffer.set(key, entry);
  }

  entry.hits += 1;
  entry.totalMs += durationMs;
  entry.maxMs = Math.max(entry.maxMs, durationMs);
  entry.lastStatus = status;
  entry.lastUsedAt = new Date();

  if (status >= 500) entry.status5xx += 1;
  else if (status >= 400) entry.status4xx += 1;
  else if (status >= 300) entry.status3xx += 1;
  else if (status >= 200) entry.status2xx += 1;
}

async function flush() {
  if (flushing || buffer.size === 0) return;
  flushing = true;

  // Swap first so requests arriving mid-flush accumulate into a fresh map
  // rather than being dropped when this one is cleared.
  const pending = buffer;
  buffer = new Map();

  try {
    await ApiUsage.bulkWrite(
      [...pending.entries()].map(([key, entry]) => ({
        updateOne: {
          filter: { key },
          update: {
            $inc: {
              hits: entry.hits,
              totalMs: entry.totalMs,
              status2xx: entry.status2xx,
              status3xx: entry.status3xx,
              status4xx: entry.status4xx,
              status5xx: entry.status5xx,
            },
            $max: { maxMs: entry.maxMs },
            $set: { lastUsedAt: entry.lastUsedAt, lastStatus: entry.lastStatus },
            $setOnInsert: { method: entry.method, path: entry.path, firstSeenAt: new Date() },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error) {
    // Telemetry must never take the API down. Put the counts back so the next
    // flush retries them, unless that would grow the buffer without limit.
    logger.warn({ err: error }, 'api usage flush failed');
    if (buffer.size < 5000) {
      for (const [key, entry] of pending) if (!buffer.has(key)) buffer.set(key, entry);
    }
  } finally {
    flushing = false;
  }
}

function startFlushing() {
  if (timer) return;
  timer = setInterval(flush, FLUSH_MS);
  // Do not hold the process open for the sake of a counter.
  if (typeof timer.unref === 'function') timer.unref();
}

/** Express middleware. Mount once, before the routes. */
function apiUsageMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const key = routeKeyOf(req);
    if (!key) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    try {
      record(key, req.method, key.slice(key.indexOf(' ') + 1), durationMs, res.statusCode);
      startFlushing();
    } catch (error) {
      logger.warn({ err: error }, 'api usage record failed');
    }
  });

  next();
}

module.exports = {
  apiUsageMiddleware,
  flush,
  routeKeyOf,
  // Exported for tests; not part of the running contract.
  _buffer: () => buffer,
  _reset: () => {
    buffer = new Map();
  },
};
