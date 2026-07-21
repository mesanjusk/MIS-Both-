const Usergroup = require('../repositories/usergroup');
const { tierFor } = require('../utils/roleHierarchy');

// Default WhatsApp order-command permissions by role tier, used whenever a
// Usergroup has no modulePermissions configured yet:
//   tier 0-1 (worker/delivery/unrecognized) — view own assigned orders only
//   tier 2   (office user)                  — view all open orders, advance stage, create orders
//   tier 3-4 (manager/admin/owner)          — view all, advance stage, assign, create orders, receive payments
// Payment collection defaults to tier 3+ only — it posts money, so it gets
// the more conservative default of the set; group admins can lower it.
function defaultWhatsAppPermissions(userGroup) {
  const tier = tierFor(userGroup);
  return {
    viewOrders: true,
    viewScope: tier >= 2 ? 'all' : 'assigned',
    advanceOrderStage: tier >= 2,
    assignOrders: tier >= 3,
    createOrders: tier >= 2,
    receivePayments: tier >= 3,
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
