const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Creates a rate limiter middleware using express-rate-limit (persistent across restarts).
 * Previously used an in-memory Map that reset on every server restart.
 */
const createRateLimiter = ({ windowMs, maxRequests, message }) => {
  return rateLimit({
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
    keyGenerator: (req) => `${req.user?.id || req.ip}:${req.path}`,
  });
};

const whatsappLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, message: 'Too many WhatsApp requests.' });
const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, maxRequests: 20, message: 'Too many login attempts.' });
const generalLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 100 });

module.exports = { createRateLimiter, whatsappLimiter, authLimiter, generalLimiter };
