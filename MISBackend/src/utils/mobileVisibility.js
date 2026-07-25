const { AppSetting } = require('../repositories/appSetting');
const { tierFor, ROLE_HIERARCHY } = require('./roleHierarchy');

const SETTING_KEY = 'mobile_number_visibility';

const DEFAULT_SETTINGS = {
  defaultHidden: true,
  customerGroups: [],
  customers: [],
  userGroups: [],
  users: [],
};

// Admin/owner/manager (same tier as middleware/authorize.js requireAdmin) always see full numbers.
const canBypassMasking = (role) => tierFor(role) >= ROLE_HIERARCHY.manager;

async function getMobileVisibilitySettings() {
  const stored = await AppSetting.getSetting(SETTING_KEY, null);
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

async function saveMobileVisibilitySettings(value) {
  const clean = {
    defaultHidden: value?.defaultHidden !== false,
    customerGroups: Array.isArray(value?.customerGroups) ? value.customerGroups.filter(Boolean) : [],
    customers: Array.isArray(value?.customers) ? value.customers.filter(Boolean) : [],
    userGroups: Array.isArray(value?.userGroups) ? value.userGroups.filter(Boolean) : [],
    users: Array.isArray(value?.users) ? value.users.filter(Boolean) : [],
  };
  await AppSetting.upsertSetting({
    key: SETTING_KEY,
    value: clean,
    description: 'Controls whether Customer/User mobile numbers are visible to non-admin users, with per-group and per-individual overrides.',
  });
  return clean;
}

function maskMobile(number) {
  const digits = String(number ?? '').trim();
  if (!digits) return digits;
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${digits.slice(0, 2)}${'*'.repeat(digits.length - 4)}${digits.slice(-2)}`;
}

function isVisible({ settings, groupName, entityUuid, groupList, entityList }) {
  if (!settings.defaultHidden) return true;
  if (entityUuid && (settings[entityList] || []).includes(entityUuid)) return true;
  if (groupName && (settings[groupList] || []).includes(groupName)) return true;
  return false;
}

const ENTITY_FIELDS = {
  customer: { groupField: 'Customer_group', uuidField: 'Customer_uuid', mobileFields: ['Mobile_number', 'Mobile'], groupList: 'customerGroups', entityList: 'customers' },
  user: { groupField: 'User_group', uuidField: 'User_uuid', mobileFields: ['Mobile_number', 'Mobile'], groupList: 'userGroups', entityList: 'users' },
};

// Masks mobile number fields in-place on a plain object based on visibility rules.
// `entity` is 'customer' or 'user'. `fields` optionally overrides field names for
// endpoints that return a differently-shaped/aliased object (e.g. { Group, Mobile }).
function maskRecord(record, { role, settings, entity, fields }) {
  if (!record || canBypassMasking(role)) return record;

  const { groupField, uuidField, mobileFields, groupList, entityList } = { ...ENTITY_FIELDS[entity], ...fields };

  const visible = isVisible({
    settings,
    groupName: record[groupField],
    entityUuid: record[uuidField],
    groupList,
    entityList,
  });

  if (visible) return record;

  mobileFields.forEach((field) => {
    if (record[field] !== undefined) record[field] = maskMobile(record[field]);
  });
  return record;
}

async function maskMobileNumbers(records, { role, entity, fields }) {
  if (canBypassMasking(role)) return records;
  const settings = await getMobileVisibilitySettings();
  const list = Array.isArray(records) ? records : [records];
  list.forEach((record) => maskRecord(record, { role, settings, entity, fields }));
  return records;
}

module.exports = {
  SETTING_KEY,
  DEFAULT_SETTINGS,
  canBypassMasking,
  getMobileVisibilitySettings,
  saveMobileVisibilitySettings,
  maskMobile,
  maskMobileNumbers,
};
