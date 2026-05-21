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
