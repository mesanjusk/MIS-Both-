const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Collapse the per-record parts of a path so one nominal limit is not split
 * across every record a caller touches.
 *
 * Keying on the literal path meant DELETE /transactions/<uuid-a> and
 * DELETE /transactions/<uuid-b> counted as two separate limits, so "100 per
 * minute" was 100 per record rather than 100 for the route.
 */
const normalizePath = (path = '') =>
  String(path)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    // Long opaque tokens (share links, nonces) are per-record too.
    .replace(/\/[A-Za-z0-9_-]{24,}/g, '/:id');

/**
 * An IPv6 caller controls a whole /64, so limiting on the full address lets one
 * client walk through addresses to reset its own counter. Key on the prefix.
 */
const normalizeIp = (ip = '') => {
  const clean = String(ip).replace(/^::ffff:/, '');
  if (!clean.includes(':')) return clean;
  return clean.split(':').slice(0, 4).join(':') + '::/64';
};

/**
 * Build a rate limiter.
 *
 * Counters live in this process's memory: they reset when the server restarts
 * and are NOT shared between instances, so the effective limit is per instance.
 * Pass a `store` (Redis, or another express-rate-limit store) when a limit has
 * to hold across restarts or across more than one instance.
 */
const createRateLimiter = ({ windowMs, maxRequests, message, store }) => {
  return rateLimit({
    ...(store ? { store } : {}),
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      status: 'fail',
      message: message || 'Rate limit exceeded. Please retry later.',
    },
    handler: (req, res, _next, options) => {
      logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
      res.status(options.statusCode).json(options.message);
    },
    // Identified callers are limited as themselves; anonymous ones by IP
    // prefix. app.set('trust proxy') in index.js is what makes req.ip the real
    // client rather than the platform proxy — without it every user behind the
    // proxy shares one key.
    keyGenerator: (req) =>
      `${req.user?.id || normalizeIp(req.ip)}:${normalizePath(req.baseUrl || '')}${normalizePath(req.path)}`,
  });
};

const whatsappLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, message: 'Too many WhatsApp requests.' });
const authLimiter     = createRateLimiter({ windowMs: 5 * 60_000, maxRequests: 5, message: 'Too many login attempts. Try again in 5 minutes.' });
const generalLimiter  = createRateLimiter({ windowMs: 60_000, maxRequests: 100 });

module.exports = {
  createRateLimiter,
  whatsappLimiter,
  authLimiter,
  generalLimiter,
  normalizePath,
  normalizeIp,
};
