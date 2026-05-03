export const ROLE_TYPES = {
  ADMIN: "Admin User",
  OFFICE: "Office User",
  VENDOR: "Vendor",
};

export const normalizeRole = (value = "") => value.trim().toLowerCase();

export const isAdminRole = (value) => normalizeRole(value).includes("admin");
export const isOfficeRole = (value) => normalizeRole(value).includes("office");
