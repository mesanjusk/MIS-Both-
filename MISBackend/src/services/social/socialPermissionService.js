// Social Media module authorization.
//
// This codebase has no generic "permission string" ACL system (see
// services/permissionService.js) — authorization is role-tier based
// (utils/roleHierarchy.js) with an optional per-Usergroup override map
// (repositories/usergroup.js `modulePermissions`). This service follows that
// exact same convention (mirrors getWhatsAppPermissionsForGroup) instead of
// bolting on a parallel permission-string engine, extended with the
// social.* keys added to Usergroup.modulePermissions.
const Usergroup = require('../../repositories/usergroup');
const { tierFor } = require('../../utils/roleHierarchy');

// Role-tier defaults, used whenever a Usergroup has no modulePermissions
// configured yet. Matches the workflow in the product spec: Designers (often
// tier 0 — a role name not present in ROLE_HIERARCHY) can view/create/edit
// their own drafts; approve/publish/manage-accounts need office-and-above
// tiers; admins/owners get everything via requireAdmin at the route layer.
function defaultSocialPermissions(userGroup) {
  const tier = tierFor(userGroup);
  return {
    socialView: true,
    socialCreate: true,
    socialEdit: true, // own posts only — enforced at the route layer
    socialDelete: tier >= 2,
    socialApprove: tier >= 3,
    socialPublish: tier >= 3,
    socialAccountsManage: tier >= 4,
    socialAnalyticsView: tier >= 2,
  };
}

const PERMISSION_KEYS = [
  'socialView',
  'socialCreate',
  'socialEdit',
  'socialDelete',
  'socialApprove',
  'socialPublish',
  'socialAccountsManage',
  'socialAnalyticsView',
];

async function getSocialPermissionsForGroup(userGroup) {
  const fallback = defaultSocialPermissions(userGroup);
  if (!userGroup) return fallback;

  const group = await Usergroup.findOne({ User_group: userGroup }).lean();
  const configured = PERMISSION_KEYS.filter((key) => group?.modulePermissions?.[key] !== undefined);
  if (!configured.length) return fallback;

  const overrides = {};
  for (const key of configured) overrides[key] = group.modulePermissions[key];
  return { ...fallback, ...overrides };
}

async function hasSocialPermission(userGroup, key) {
  const perms = await getSocialPermissionsForGroup(userGroup);
  return Boolean(perms[key]);
}

module.exports = {
  defaultSocialPermissions,
  getSocialPermissionsForGroup,
  hasSocialPermission,
  PERMISSION_KEYS,
};
