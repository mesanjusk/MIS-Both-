const AppError = require('../utils/AppError');
const { hasSocialPermission } = require('../services/social/socialPermissionService');

/**
 * requireSocialPermission(key) — must be used AFTER requireAuth.
 * Usage: router.post('/posts/:id/approve', requireAuth, requireSocialPermission('socialApprove'), handler)
 */
const requireSocialPermission = (key) => async (req, _res, next) => {
  try {
    const userGroup = req.user?.userGroup || req.user?.User_group || '';
    const allowed = await hasSocialPermission(userGroup, key);
    if (!allowed) {
      return next(new AppError(`Access denied: requires social permission "${key}"`, 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { requireSocialPermission };
