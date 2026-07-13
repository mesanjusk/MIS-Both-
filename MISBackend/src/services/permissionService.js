const Usergroup = require('../repositories/usergroup');

// Same tiering as middleware/authorize.js — duplicated here (not imported)
// because this resolves WhatsApp-command permissions from a plain group
// name string, not from an authenticated req.user.
const ROLE_HIERARCHY = {
  admin: 4,
  owner: 4,
  manager: 3,
  'office user': 2,
  worker: 1,
  delivery: 1,
};

const ROLE_ALIASES = {
  'admin user': 'admin',
  superadmin: 'admin',
  'super admin': 'admin',
};

const normalizeRole = (role = '') => String(role || '').trim().toLowerCase();
const resolveHierarchyRole = (role) => ROLE_ALIASES[role] || role;

function tierFor(userGroup) {
  return ROLE_HIERARCHY[resolveHierarchyRole(normalizeRole(userGroup))] || 0;
}

// Default WhatsApp order-command permissions by role tier, used whenever a
// Usergroup has no modulePermissions configured yet:
//   tier 0-1 (worker/delivery/unrecognized) — view own assigned orders only
//   tier 2   (office user)                  — view all open orders, advance stage
//   tier 3-4 (manager/admin/owner)          — view all, advance stage, assign
function defaultWhatsAppPermissions(userGroup) {
  const tier = tierFor(userGroup);
  return {
    viewOrders: true,
    viewScope: tier >= 2 ? 'all' : 'assigned',
    advanceOrderStage: tier >= 2,
    assignOrders: tier >= 3,
  };
}

async function getWhatsAppPermissionsForGroup(userGroup) {
  const fallback = defaultWhatsAppPermissions(userGroup);
  if (!userGroup) return fallback;

  const group = await Usergroup.findOne({ User_group: userGroup }).lean();
  if (!group?.modulePermissions || Object.keys(group.modulePermissions).length === 0) {
    return fallback;
  }

  return { ...fallback, ...group.modulePermissions };
}

module.exports = { getWhatsAppPermissionsForGroup, defaultWhatsAppPermissions };
