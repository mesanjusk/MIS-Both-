/**
 * Per-user permission enforcement — the server-side half of the permission
 * flags an admin toggles on the Admin → User Permissions screen
 * (see MISFrontend/src/Pages/AdminUserPermissions.jsx and the `permissions`
 * sub-document in repositories/users.js).
 *
 * Must be used AFTER requireAuth (which sets req.user).
 *
 * Why this loads the user from the database rather than trusting the token:
 * the login JWT carries only { id, userName, userGroup } (see routes/Users.js)
 * and lives for 45 days. Permissions are not in the token and can be changed
 * by an admin at any time, so the only correct source is the current user row.
 *
 * Defaulting rule — permissive, matching the frontend. A flag is denied ONLY
 * when it is explicitly `false`. An unset flag (a user whose permissions have
 * never been edited) is allowed, exactly as DEFAULT_PERMISSIONS and the route
 * guards treat it; treating "unset" as "denied" would lock out every legacy
 * account.
 *
 * Admin / owner (hierarchy tier 4) always pass: they administer permissions
 * and must not be able to lock themselves out of the operations they grant.
 */
const AppError = require('../utils/AppError');
const Users = require('../repositories/users');
const { tierFor } = require('../utils/roleHierarchy');
const logger = require('../utils/logger');

const isTier4 = (req) => tierFor(req.user?.userGroup || req.user?.User_group) >= 4;

/**
 * Look up the acting user's permissions sub-document once. Cached on req so
 * chained permission checks in one request don't re-hit the database.
 */
const loadPermissions = async (req) => {
  if (req._permissions !== undefined) return req._permissions;
  const user = await Users.findById(req.user.id).select('permissions').lean();
  req._permissions = user?.permissions || {};
  return req._permissions;
};

/**
 * requirePermission(flag) — require the named permission flag to not be
 * explicitly false. Pass a flag key such as 'canCreateOrders'.
 */
const requirePermission = (flag) => async (req, _res, next) => {
  try {
    if (isTier4(req)) return next();
    const permissions = await loadPermissions(req);
    if (permissions[flag] === false) {
      return next(
        new AppError(`Access denied: you do not have the "${flag}" permission`, 403)
      );
    }
    return next();
  } catch (error) {
    logger.error({ err: error.message, flag }, 'requirePermission check failed');
    return next(error);
  }
};

// Statuses that retire an order. Moving an order to any of these is the
// "cancel/delete order" action the canDeleteOrders flag governs.
const CANCEL_TASKS = new Set(['cancel', 'cancelled', 'canceled']);

/**
 * Resolve the target status Task from the several request shapes the status
 * routes accept (drag-drop `Task`, legacy `newStatus`, `task`).
 */
const resolveTask = (req) => {
  const raw =
    req.body?.Task ||
    req.body?.task ||
    (typeof req.body?.newStatus === 'string' ? req.body.newStatus : req.body?.newStatus?.Task) ||
    '';
  return String(raw || '').trim().toLowerCase();
};

/**
 * requireCancelPermission — for the shared order-status endpoints, which carry
 * both ordinary stage moves and cancellations. Only a move to a cancel status
 * is gated (on canDeleteOrders); every other status change passes through so
 * normal workflow is unaffected.
 */
const requireCancelPermission = async (req, res, next) => {
  if (!CANCEL_TASKS.has(resolveTask(req))) return next();
  return requirePermission('canDeleteOrders')(req, res, next);
};

module.exports = { requirePermission, requireCancelPermission };
