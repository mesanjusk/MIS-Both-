// Shared role-tier table — the single source of truth for both app-side
// role authorization (middleware/authorize.js) and WhatsApp command
// permissions (services/permissionService.js). These two previously kept
// independent copies of this table, which risked silently drifting apart
// (e.g. a role downgraded in one place but not the other).
const ROLE_HIERARCHY = {
  admin: 4,
  owner: 4,
  manager: 3,
  'office user': 2,
  worker: 1,
  delivery: 1,
};

// Real User_group values stored on accounts (see MISFrontend/src/constants/roles.js
// ROLE_TYPES.ADMIN = "Admin User") don't always match the short hierarchy keys
// above — map known aliases to their canonical hierarchy key before comparing.
const ROLE_ALIASES = {
  'admin user': 'admin',
  superadmin: 'admin',
  'super admin': 'admin',
};

const normalizeRole = (role = '') => String(role || '').trim().toLowerCase();

const resolveHierarchyRole = (role) => ROLE_ALIASES[role] || role;

const tierFor = (userGroup) => ROLE_HIERARCHY[resolveHierarchyRole(normalizeRole(userGroup))] || 0;

module.exports = { ROLE_HIERARCHY, ROLE_ALIASES, normalizeRole, resolveHierarchyRole, tierFor };
