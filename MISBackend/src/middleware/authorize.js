/**
 * Authorization middleware — enforces role-based access control.
 * Must be used AFTER requireAuth (which sets req.user).
 *
 * Usage:
 *   router.delete('/x', requireAuth, requireRole('admin'), handler)
 *   router.get('/y', requireAuth, requireRole(['admin', 'office user']), handler)
 */
const AppError = require('../utils/AppError');
const { ROLE_HIERARCHY, normalizeRole, resolveHierarchyRole } = require('../utils/roleHierarchy');

/**
 * requireRole(roles) — require the user to have one of the specified roles.
 * Pass a string or array of strings.
 */
const requireRole = (roles) => (req, _res, next) => {
  const allowed = Array.isArray(roles)
    ? roles.map(normalizeRole)
    : [normalizeRole(roles)];

  const userRole = normalizeRole(req.user?.userGroup || req.user?.User_group || '');

  if (!userRole) {
    return next(new AppError('Access denied: role not found in token', 403));
  }

  if (allowed.includes(userRole)) {
    return next();
  }

  // Also allow if user's hierarchy level >= minimum required
  const resolvedUserRole = resolveHierarchyRole(userRole);
  const userLevel = ROLE_HIERARCHY[resolvedUserRole] || 0;
  const minRequired = Math.min(...allowed.map((r) => ROLE_HIERARCHY[resolveHierarchyRole(r)] || 999));

  if (userLevel >= minRequired) {
    return next();
  }

  return next(
    new AppError(
      `Access denied: requires role [${allowed.join(' | ')}], your role is "${userRole}"`,
      403
    )
  );
};

/**
 * requireAdmin — shorthand for admin/owner/manager
 */
const requireAdmin = requireRole(['admin', 'owner', 'manager']);

/**
 * requireOfficeOrAbove — shorthand for office user and above
 */
const requireOfficeOrAbove = requireRole(['admin', 'owner', 'manager', 'office user']);

module.exports = { requireRole, requireAdmin, requireOfficeOrAbove };
