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
