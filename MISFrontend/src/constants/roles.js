export const ROLE_TYPES = {
  ADMIN: "Admin User",
  OFFICE: "Office User",
  OFFICE_ADMIN: "Office Admin",
  OFFICE_DESIGN: "Office Design",
  OFFICE_MARKETING: "Office Marketing",
  VENDOR: "Vendor",
};

export const OFFICE_GROUPS = [
  "Office User",
  "Office Admin",
  "Office Design",
  "Office Marketing",
];

export const isOfficeGroup = (group = "") =>
  OFFICE_GROUPS.includes(String(group || "").trim());

export const normalizeRole = (value = "") => value.trim().toLowerCase();

export const isAdminRole = (value) => normalizeRole(value).includes("admin");
export const isOfficeRole = (value) => normalizeRole(value).includes("office");

// Mirrors the backend's ROLE_HIERARCHY tier-4 set (see MISBackend/src/utils/roleHierarchy.js):
// admin / owner / superadmin only — unlike isAdminRole above, this deliberately
// excludes "Office Admin" and similar roles that merely contain the word "admin".
const SUPER_ADMIN_ROLES = new Set(["admin user", "admin", "owner", "superadmin", "super admin"]);
export const isSuperAdminRole = (value) => SUPER_ADMIN_ROLES.has(normalizeRole(value));

// ── Navigation / route-authorization role keys ─────────────────────────────
//
// The app has historically spoken two role vocabularies: the `User_group`
// string stored on the account ("Admin User", "Office User") and the short key
// the menus are written against ("Admin", "Accounts", "OfficeStaff"). The
// translation between them lived inside TopNavbar, which meant the menus and
// the routes could not share it — the menu hid a link while the route behind
// it stayed open to anyone who typed the URL.
//
// It lives here now so SIDEBAR_GROUPS, the desktop nav, the mobile nav and the
// route guards all decide access the same way.

export const NAV_ROLES = Object.freeze({
  ADMIN: 'Admin',
  OWNER: 'Owner',
  ACCOUNTS: 'Accounts',
  DESIGNER: 'Designer',
  DATA_ENTRY: 'DataEntry',
  OFFICE_STAFF: 'OfficeStaff',
  OFFICE_ADMIN: 'OfficeAdmin',
  OFFICE_DESIGN: 'OfficeDesign',
  OFFICE_MARKETING: 'OfficeMarketing',
});

/**
 * Stored `User_group` -> menu role key.
 *
 * Note that 'owner' maps to 'Admin' rather than 'Owner'. That is intentional
 * and pre-existing: every menu entry naming 'Owner' also names 'Admin', so an
 * owner is admitted everywhere an admin is. `isSuperAdminRole` above still
 * distinguishes the two where the distinction matters.
 */
export const normalizeRoleKey = (value = '') => {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['admin', 'adminuser', 'superadmin', 'owner'].includes(text)) return NAV_ROLES.ADMIN;
  if (['designer'].includes(text)) return NAV_ROLES.DESIGNER;
  if (['dataentry', 'dataentryuser'].includes(text)) return NAV_ROLES.DATA_ENTRY;
  if (['officestaff', 'officeuser', 'otheroffice'].includes(text)) return NAV_ROLES.OFFICE_STAFF;
  if (['officeadmin'].includes(text)) return NAV_ROLES.OFFICE_ADMIN;
  if (['officedesign'].includes(text)) return NAV_ROLES.OFFICE_DESIGN;
  if (['officemarketing'].includes(text)) return NAV_ROLES.OFFICE_MARKETING;
  if (['accounts', 'accountant', 'accountsuser'].includes(text)) return NAV_ROLES.ACCOUNTS;
  return value || 'User';
};

// The three audiences the menus are written against. Defined here rather than
// in sidebarMenu.jsx so route guards can name the same set the menu names.
export const ADMIN_ROLES = Object.freeze([NAV_ROLES.ADMIN, NAV_ROLES.OWNER]);

export const OFFICE_ROLES = Object.freeze([
  NAV_ROLES.ADMIN, NAV_ROLES.OWNER, NAV_ROLES.DESIGNER, NAV_ROLES.DATA_ENTRY,
  NAV_ROLES.OFFICE_STAFF, NAV_ROLES.OFFICE_ADMIN, NAV_ROLES.OFFICE_DESIGN,
  NAV_ROLES.OFFICE_MARKETING,
]);

export const ACCOUNT_ROLES = Object.freeze([
  NAV_ROLES.ADMIN, NAV_ROLES.OWNER, NAV_ROLES.ACCOUNTS,
]);

/** Every signed-in user, whatever their group. Matches the menus' `['all']`. */
export const ANY_ROLE = 'all';

/**
 * The one access decision, used by both the menus and the route guards.
 *
 * `allowed` is a menu entry's `roles` array. An entry with no roles is
 * admin-only, matching how the nav has always treated a missing list.
 */
export const isRoleAllowed = (allowed, roleKey) => {
  const roles = Array.isArray(allowed) && allowed.length ? allowed : ADMIN_ROLES;
  return roles.includes(ANY_ROLE) || roles.includes(roleKey);
};
