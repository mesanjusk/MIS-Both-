const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const Users = require('../repositories/users');

/** The bare JWT from an `Authorization: Bearer <token>` header. */
const token = (authHeader) => authHeader.split(' ')[1];

/**
 * Verify the token's signature and return its payload, or throw an AppError.
 */
const decodeToken = (token, path) => {
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.info({ path }, 'Expired token presented');
      throw new AppError('Token expired. Please log in again.', 401);
    }
    logger.warn({ err: error.message, path }, 'Invalid token');
    throw new AppError('Invalid or expired token', 401);
  }
};

/**
 * Check the token against the account it names, and return the session it
 * represents.
 *
 * A valid signature only proves the token was issued; it says nothing about
 * whether the account still exists, still holds the role written into it, or
 * has since been revoked. Tokens live 45 days, so trusting the payload alone
 * kept deleted and demoted users working for up to that long — and a token
 * naming a user who no longer exists passed the permission guard entirely,
 * because a missing row read as an empty, permissive permissions object.
 *
 * The permissions sub-document is cached on the request so a later
 * requirePermission check reuses this read rather than issuing its own.
 *
 * @throws {AppError} 401 when the session is no longer valid
 */
const resolveSession = async (payload, req) => {
  const id = payload.id || payload._id || payload.userId;
  if (!id) throw new AppError('Invalid token payload', 401);

  const user = await Users.findById(id)
    .select('User_name User_group permissions Session_version')
    .lean();

  if (!user) {
    logger.warn({ id, path: req?.originalUrl }, 'Token presented for a user that no longer exists');
    throw new AppError('Session is no longer valid. Please log in again.', 401);
  }

  const tokenVersion  = Number(payload.sv || 0);
  const storedVersion = Number(user.Session_version || 0);
  if (tokenVersion !== storedVersion) {
    logger.info({ id, path: req?.originalUrl }, 'Token presented after session revocation');
    throw new AppError('Session has expired. Please log in again.', 401);
  }

  if (req) req._permissions = user.permissions || {};

  return {
    ...payload,
    id: String(user._id),
    userName: user.User_name,
    // The CURRENT role, not the one written into the token — a demotion has to
    // take effect without waiting for the token to expire.
    userGroup: user.User_group,
  };
};

/**
 * requireAuth — validates the Bearer JWT and the session behind it.
 * Sets req.user = { id, userName, userGroup, ...payload }
 */
const requireAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authorization token is required', 401));
  }

  try {
    const payload = decodeToken(token(authHeader), req.originalUrl);
    req.user = await resolveSession(payload, req);
    return next();
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Invalid or expired token', 401));
  }
};

/**
 * optionalAuth — attaches user if token present, does not block if absent.
 * Useful for endpoints that behave differently for authenticated users.
 */
const optionalAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const payload = jwt.verify(token(authHeader), process.env.ACCESS_TOKEN_SECRET);
    // Same session check as requireAuth: a revoked or deleted account must not
    // arrive as an identified caller just because the route tolerates none.
    req.user = await resolveSession(payload, req);
  } catch {
    // Silently unidentified in optional mode — an invalid, expired or revoked
    // token leaves req.user unset rather than failing the request.
    delete req.user;
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

module.exports = {
  decodeToken,
  resolveSession,
  requireAuth,
  optionalAuth,
  requireInternalKey,
};
