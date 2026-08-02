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

// The only keys permissionService/WhatsApp commands actually consult — kept
// separate from a plain Object.keys(...).length check because Mongoose
// auto-assigns an _id to a nested subdocument (see repositories/usergroup.js)
// the moment modulePermissions is written at all, even as `{}` (e.g. routes/
// Usergroup.js's update route $sets an empty object when no permission
// booleans are in the request body). Without this, that stray _id would (a)
// make an actually-unconfigured group look "configured" and (b) leak into
// the returned permissions object via the spread below.
const PERMISSION_KEYS = ['viewOrders', 'advanceOrderStage', 'assignOrders', 'createOrders', 'receivePayments'];

async function getWhatsAppPermissionsForGroup(userGroup) {
  const fallback = defaultWhatsAppPermissions(userGroup);
  if (!userGroup) return fallback;

  const group = await Usergroup.findOne({ User_group: userGroup }).lean();
  const configured = PERMISSION_KEYS.filter((key) => group?.modulePermissions?.[key] !== undefined);
  if (!configured.length) {
    return fallback;
  }

  const overrides = {};
  for (const key of configured) overrides[key] = group.modulePermissions[key];
  return { ...fallback, ...overrides };
}

module.exports = { getWhatsAppPermissionsForGroup, defaultWhatsAppPermissions };
