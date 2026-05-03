const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * requireAuth — validates Bearer JWT token.
 * Sets req.user = { id, userName, userGroup, ...payload }
 */
const requireAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authorization token is required', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = {
      id: payload.id || payload._id || payload.userId,
      ...payload,
    };

    if (!req.user.id) {
      return next(new AppError('Invalid token payload', 401));
    }

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.info({ path: req.originalUrl }, 'Expired token presented');
      return next(new AppError('Token expired. Please log in again.', 401));
    }
    logger.warn({ err: error.message, path: req.originalUrl }, 'Invalid token');
    return next(new AppError('Invalid or expired token', 401));
  }
};

/**
 * optionalAuth — attaches user if token present, does not block if absent.
 * Useful for endpoints that behave differently for authenticated users.
 */
const optionalAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = {
      id: payload.id || payload._id || payload.userId,
      ...payload,
    };
  } catch {
    // silently ignore invalid/expired token in optional mode
  }
  return next();
};

/**
 * requireInternalKey — validates X-Internal-Key header.
 * Use for cron-job / server-to-server endpoints (scheduler, reminders).
 */
const requireInternalKey = (req, _res, next) => {
  const key = req.headers['x-internal-key'] || req.query?.internalKey;
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected) {
    logger.warn({ path: req.originalUrl }, 'INTERNAL_API_KEY not set — blocking request');
    return next(new AppError('Internal API not configured', 503));
  }

  if (!key || key !== expected) {
    return next(new AppError('Invalid or missing internal API key', 401));
  }

  return next();
};

module.exports = { requireAuth, optionalAuth, requireInternalKey };
