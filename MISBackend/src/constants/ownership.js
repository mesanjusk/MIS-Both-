// The responsibility ownership chain, in strict fallback order.
//
// Every resolver (responsibilities, tasks, SOP checklist) walks this list
// instead of naming slots one by one, so extending the chain — Backup 3,
// Backup 4, a Backup 5 later — is a single edit here plus the schema fields.
// Order is the fallback order: the first available holder owns the work, and
// nothing implicitly falls to a senior user when the chain runs out.
const OWNERSHIP_SLOTS = Object.freeze([
  Object.freeze({ role: 'primary', field: 'primaryUserUuid', label: 'Primary' }),
  Object.freeze({ role: 'backup1', field: 'backup1UserUuid', label: 'Backup 1' }),
  Object.freeze({ role: 'backup2', field: 'backup2UserUuid', label: 'Backup 2' }),
  Object.freeze({ role: 'backup3', field: 'backup3UserUuid', label: 'Backup 3' }),
  Object.freeze({ role: 'backup4', field: 'backup4UserUuid', label: 'Backup 4' }),
]);

const BACKUP_SLOTS = Object.freeze(OWNERSHIP_SLOTS.filter((slot) => slot.role !== 'primary'));

/** ['primaryUserUuid', 'backup1UserUuid', ...] — for schemas, routes and audits. */
const OWNERSHIP_FIELDS = Object.freeze(OWNERSHIP_SLOTS.map((slot) => slot.field));
const BACKUP_FIELDS = Object.freeze(BACKUP_SLOTS.map((slot) => slot.field));

/** Valid `ownerRole` values, including the terminal escalation state. */
const OWNER_ROLES = Object.freeze([...OWNERSHIP_SLOTS.map((slot) => slot.role), 'escalated']);

/**
 * Read the chain off a record (a responsibility, a task, an SOP item),
 * optionally falling back to a linked responsibility slot by slot.
 * Returns [{ role, userUuid }] in fallback order.
 */
const readChain = (source = {}, fallback = null) =>
  OWNERSHIP_SLOTS.map((slot) => ({
    role: slot.role,
    userUuid: source[slot.field] || fallback?.[slot.field] || '',
  }));

/** The configured chain as a plain object, every slot present and defaulted. */
const chainFields = (source = {}, fallback = null) =>
  Object.fromEntries(
    OWNERSHIP_SLOTS.map((slot) => [slot.field, source[slot.field] || fallback?.[slot.field] || ''])
  );

/** True when any backup slot on `source` holds this user. */
const isBackupUser = (source = {}, userUuid = '') =>
  Boolean(userUuid) && BACKUP_FIELDS.some((field) => source[field] === userUuid);

module.exports = {
  OWNERSHIP_SLOTS,
  BACKUP_SLOTS,
  OWNERSHIP_FIELDS,
  BACKUP_FIELDS,
  OWNER_ROLES,
  readChain,
  chainFields,
  isBackupUser,
};
