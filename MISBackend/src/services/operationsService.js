// Team Operations — availability + responsibility resolution.
//
// The whole module rests on three rules:
//   1. The database stores *configuration* (who is P1, who backs up what).
//   2. Availability is *derived* from the existing Attendance records — this
//      module never writes attendance and never defines a second attendance
//      schema (see repositories/attendance.js + services/attendanceService.js).
//   3. Runtime ownership is *computed*, never persisted over the configured
//      chain, so a primary who returns from leave gets their work back with no
//      repair step.
const Attendance = require('../repositories/attendance');
const AttendanceAbsence = require('../repositories/AttendanceAbsence');
const Responsibility = require('../repositories/responsibility');
const User = require('../repositories/users');
const OperationsAuditLog = require('../repositories/operationsAuditLog');
const { AppSetting } = require('../repositories/appSetting');
const { getDateOnly } = require('./attendanceService');
const { tierFor } = require('../utils/roleHierarchy');
const {
  OWNERSHIP_SLOTS, BACKUP_FIELDS, readChain, chainFields,
} = require('../constants/ownership');

// ── Settings keys (all editable from the frontend, none compiled in) ────────
const STORE_SETTINGS_KEY = 'operations_store_settings';
const PRIORITY_LEVELS_KEY = 'operations_priority_levels';
const DEPARTMENTS_KEY = 'operations_departments';
// Maps an automation hook (an order stage, or a lifecycle hook name) to the
// responsibility whose chain should own the task it creates. Empty by default:
// with no mapping configured, existing automation behaves exactly as before.
const STAGE_RESPONSIBILITIES_KEY = 'operations_stage_responsibilities';
// Operators who hold responsibilities but have no attendance record to derive
// availability from — the AI assistant, and any other standing automation.
// A *person* is never configured here: a human owner is a User with the
// `alwaysAvailable` operations flag, so their tasks, audit trail and profile
// stay in the one place the rest of the system already reads them from.
const VIRTUAL_OPERATORS_KEY = 'operations_virtual_operators';

// Initial values only. Management edits these from Settings → Operations; the
// seeded values exist so a fresh install is usable, not so behaviour is fixed.
const DEFAULT_STORE_SETTINGS = {
  reportingTime: '09:30',
  openingTime: '10:00',
  closingTime: '19:30',
  workingDays: [1, 2, 3, 4, 5, 6], // 0 = Sunday
  lateGraceMinutes: 10,
  escalationUserUuids: [], // empty = derive from role hierarchy (manager and above)
};

// Initial catalogue only — management adds, renames and removes codes from
// Settings → Operations. OWNER and AI ship alongside P1..P4 because work is
// held by more than the numbered staff line: the owner takes some of it
// personally, and some is handled by the AI assistant.
const DEFAULT_PRIORITY_LEVELS = [
  { code: 'P1', label: 'P1', description: '' },
  { code: 'P2', label: 'P2', description: '' },
  { code: 'P3', label: 'P3', description: '' },
  { code: 'P4', label: 'P4', description: '' },
  { code: 'OWNER', label: 'Owner', description: 'Held by the owner personally' },
  { code: 'AI', label: 'AI', description: 'Handled by the AI assistant' },
];

// The AI assistant, available out of the box so an area can be pointed at it
// without configuration. Stored virtual operators replace this list entirely,
// exactly like the priority catalogue above.
const DEFAULT_VIRTUAL_OPERATORS = [
  {
    uuid: 'operator-ai-assistant',
    name: 'AI Assistant',
    kind: 'ai',
    priority: 'AI',
    roleTitle: 'Handled by AI',
    department: '',
    backupEligible: true,
    active: true,
  },
];

const DEFAULT_DEPARTMENTS = ['Design', 'Operations', 'Marketing', 'Logistics', 'Accounts', 'Store'];

const RESPONSIBILITY_CATEGORIES = [
  'outside_logistics',
  'inside_store',
  'customer',
  'design',
  'production',
  'marketing',
  'accounts',
  'general',
];

const OPERATIONAL_STATES = ['Available', 'Busy', 'Outside'];

// Attendance-derived statuses. 'Present' / 'Late' / 'Half Day' keep a user in
// the chain; the rest take them out of it.
const AVAILABLE_ATTENDANCE = new Set(['Present', 'Late', 'Half Day']);

const getStoreSettings = async () => {
  const stored = await AppSetting.getSetting(STORE_SETTINGS_KEY, null);
  return { ...DEFAULT_STORE_SETTINGS, ...(stored || {}) };
};

const getPriorityLevels = async () => {
  const stored = await AppSetting.getSetting(PRIORITY_LEVELS_KEY, null);
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_PRIORITY_LEVELS;
};

/**
 * Virtual operators, normalised. Anything stored without a uuid or a name is
 * dropped rather than silently becoming an un-addressable slot value.
 */
const getVirtualOperators = async () => {
  const stored = await AppSetting.getSetting(VIRTUAL_OPERATORS_KEY, null);
  const list = Array.isArray(stored) ? stored : DEFAULT_VIRTUAL_OPERATORS;
  return list
    .filter((item) => item && String(item.uuid || '').trim() && String(item.name || '').trim())
    .map((item) => ({
      uuid: String(item.uuid).trim(),
      name: String(item.name).trim(),
      kind: String(item.kind || 'ai').trim(),
      priority: String(item.priority || '').trim(),
      roleTitle: String(item.roleTitle || '').trim(),
      department: String(item.department || '').trim(),
      backupEligible: item.backupEligible !== false,
      active: item.active !== false,
    }));
};

const getStageResponsibilities = async () => {
  const stored = await AppSetting.getSetting(STAGE_RESPONSIBILITIES_KEY, null);
  return stored && typeof stored === 'object' ? stored : {};
};

const getDepartments = async () => {
  const stored = await AppSetting.getSetting(DEPARTMENTS_KEY, null);
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_DEPARTMENTS;
};

// ── Time helpers ───────────────────────────────────────────────────────────

// Attendance rows carry whatever the marking channel produced — '09:35',
// '9:35 AM', '21:05'. Parse all three shapes rather than assuming one.
const parseClockMinutes = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] ? match[3].toLowerCase() : '';
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23) return null;
  return hours * 60 + minutes;
};

const istNow = (date = new Date()) => new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

// ── Attendance derivation (read-only over the existing schema) ─────────────

/**
 * Turn one existing Attendance document into an operational status.
 * Never mutates and never creates attendance — this is a pure read.
 */
const deriveAttendanceStatus = ({ attendance, absence, storeSettings, workingDays, now = new Date() }) => {
  const settings = { ...DEFAULT_STORE_SETTINGS, ...(storeSettings || {}) };
  const days = Array.isArray(workingDays) && workingDays.length ? workingDays : settings.workingDays;
  const isWorkingDay = days.includes(istNow(now).getDay());

  if (!attendance) {
    if (absence) return { status: 'On Leave', detail: absence.reason || '', inTime: '', outTime: '' };
    if (!isWorkingDay) return { status: 'Weekly Off', detail: '', inTime: '', outTime: '' };
    return { status: 'Absent', detail: '', inTime: '', outTime: '' };
  }

  // The existing Attendance.Status is a free-text field ('Active', 'Completed',
  // and whatever an admin has typed). Honour explicit leave/half-day markings
  // written there instead of adding a parallel status field.
  const recordStatus = String(attendance.Status || '').toLowerCase();
  const entries = Array.isArray(attendance.User) ? attendance.User : [];
  const firstIn = entries.find((entry) => entry?.Type === 'In');
  const lastOut = [...entries].reverse().find((entry) => entry?.Type === 'Out');
  const inTime = firstIn?.Time || '';
  const outTime = lastOut?.Time || '';

  if (/leave/.test(recordStatus)) return { status: 'On Leave', detail: '', inTime, outTime };
  if (/half/.test(recordStatus)) return { status: 'Half Day', detail: '', inTime, outTime };
  if (/absent/.test(recordStatus)) return { status: 'Absent', detail: '', inTime, outTime };

  if (!entries.length) return { status: 'Absent', detail: '', inTime, outTime };

  const lastType = entries[entries.length - 1]?.Type;
  if (lastType === 'Out') return { status: 'Day Closed', detail: '', inTime, outTime };
  if (lastType === 'Lunch Out') return { status: 'On Break', detail: '', inTime, outTime };

  const reportingMinutes = parseClockMinutes(settings.reportingTime);
  const inMinutes = parseClockMinutes(inTime);
  const grace = Number(settings.lateGraceMinutes) || 0;
  if (reportingMinutes !== null && inMinutes !== null && inMinutes > reportingMinutes + grace) {
    return { status: 'Late', detail: `Reported ${inMinutes - reportingMinutes} min late`, inTime, outTime };
  }

  return { status: 'Present', detail: '', inTime, outTime };
};

/**
 * Combine attendance status + operational state into an availability verdict.
 *
 * The category argument is what keeps a delivery run from freezing the store:
 * a user marked Outside is still the right person for `outside_logistics`, and
 * only steps out of the chain for `inside_store` work.
 */
const isAvailableFor = (availability, category = 'general') => {
  if (!availability) return { available: false, reason: 'Unknown user' };
  if (!availability.operationsActive) return { available: false, reason: 'Not active in operations' };
  // An always-available operator — the AI assistant, or an owner who holds work
  // without clocking in — skips the attendance gate but not the operational
  // state below: an owner who is Outside still hands inside-store work on.
  if (!availability.alwaysAvailable && !AVAILABLE_ATTENDANCE.has(availability.attendanceStatus)) {
    return { available: false, reason: availability.attendanceStatus };
  }
  if (availability.operationalState === 'Outside') {
    if (category === 'outside_logistics') {
      return { available: true, reason: 'Outside — on logistics duty' };
    }
    return { available: false, reason: 'Outside' };
  }
  if (availability.operationalState === 'Busy') {
    return { available: false, reason: 'Busy', soft: true };
  }
  return { available: true, reason: availability.attendanceStatus };
};

/**
 * Build the availability map for a set of users for one date.
 * One Attendance query and one absence query for the whole team, not per user.
 */
const buildAvailabilityMap = async (users, { date = new Date(), storeSettings } = {}) => {
  const settings = storeSettings || (await getStoreSettings());
  const dayDate = getDateOnly(date);
  const uuids = users.map((user) => user.User_uuid).filter(Boolean);

  const [attendanceRows, absenceRows, virtualOperators] = await Promise.all([
    Attendance.find({ Employee_uuid: { $in: uuids }, Date: dayDate }).lean(),
    AttendanceAbsence.find({ Employee_uuid: { $in: uuids }, forDate: dayDate }).lean(),
    getVirtualOperators(),
  ]);

  const attendanceByUser = new Map(attendanceRows.map((row) => [row.Employee_uuid, row]));
  const absenceByUser = new Map(absenceRows.map((row) => [row.Employee_uuid, row]));

  const map = new Map();
  for (const user of users) {
    const ops = user.operations || {};
    const derived = deriveAttendanceStatus({
      attendance: attendanceByUser.get(user.User_uuid),
      absence: absenceByUser.get(user.User_uuid),
      storeSettings: settings,
      workingDays: ops.workingDays,
      now: date,
    });

    map.set(user.User_uuid, {
      userUuid: user.User_uuid,
      userName: user.User_name,
      name: user.name || user.User_name,
      userGroup: user.User_group,
      priority: ops.priority || '',
      roleTitle: ops.roleTitle || '',
      department: ops.department || '',
      backupEligible: ops.backupEligible !== false,
      operationsActive: ops.active !== false,
      alwaysAvailable: ops.alwaysAvailable === true,
      isVirtual: false,
      operatorKind: 'user',
      attendanceStatus: derived.status,
      attendanceDetail: derived.detail,
      inTime: derived.inTime,
      outTime: derived.outTime,
      operationalState: ops.state?.status || 'Available',
      currentTask: ops.state?.currentTask || '',
      stateSince: ops.state?.since || null,
      workingDays: Array.isArray(ops.workingDays) ? ops.workingDays : settings.workingDays,
      startTime: ops.startTime || settings.reportingTime,
      endTime: ops.endTime || settings.closingTime,
    });
  }

  // Virtual operators have no attendance to derive from — they are available
  // whenever they are active, and drop out of the chain the moment an admin
  // deactivates them. Keyed the same way as users so every resolver, task
  // lookup and dashboard row reaches them with no special case.
  for (const operator of virtualOperators) {
    map.set(operator.uuid, {
      userUuid: operator.uuid,
      userName: operator.name,
      name: operator.name,
      userGroup: '',
      priority: operator.priority,
      roleTitle: operator.roleTitle,
      department: operator.department,
      backupEligible: operator.backupEligible,
      operationsActive: operator.active,
      alwaysAvailable: true,
      isVirtual: true,
      operatorKind: operator.kind,
      attendanceStatus: 'Always On',
      attendanceDetail: '',
      inTime: '',
      outTime: '',
      operationalState: 'Available',
      currentTask: '',
      stateSince: null,
      workingDays: settings.workingDays,
      startTime: settings.reportingTime,
      endTime: settings.closingTime,
    });
  }

  return map;
};

/** Managers/admins to escalate to — derived from the role hierarchy, never a fixed id list. */
const resolveEscalationTargets = async (storeSettings) => {
  const settings = storeSettings || (await getStoreSettings());
  const configured = (settings.escalationUserUuids || []).filter(Boolean);
  if (configured.length) {
    const users = await User.find({ User_uuid: { $in: configured } })
      .select('User_uuid User_name User_group')
      .lean();
    if (users.length) return users;
  }
  const all = await User.find({}).select('User_uuid User_name User_group').lean();
  return all.filter((user) => tierFor(user.User_group) >= 3);
};

/**
 * Walk one responsibility's configured chain and report who actually owns it
 * right now. Strictly primary → backup 1 → backup 2 → backup 3 → backup 4 →
 * escalation (see OWNERSHIP_SLOTS): there is no implicit "give it to P1" step,
 * so the senior designer never becomes the default owner of every unattended
 * task.
 */
const resolveResponsibilityOwner = (responsibility, availabilityMap) => {
  const category = responsibility.category || 'general';
  const slots = readChain(responsibility);

  const chain = [];
  let owner = null;

  for (const slot of slots) {
    if (!slot.userUuid) {
      chain.push({ ...slot, configured: false, available: false, reason: 'Not configured' });
      continue;
    }
    const availability = availabilityMap.get(slot.userUuid);
    if (!availability) {
      chain.push({
        ...slot,
        configured: true,
        available: false,
        reason: 'Invalid user reference',
        invalid: true,
      });
      continue;
    }
    // A backup who is not backup-eligible stays out of the chain; the primary
    // slot ignores that flag because it is a deliberate direct assignment.
    if (slot.role !== 'primary' && !availability.backupEligible) {
      chain.push({
        ...slot,
        configured: true,
        userName: availability.userName,
        available: false,
        reason: 'Not backup eligible',
      });
      continue;
    }

    const verdict = isAvailableFor(availability, category);
    chain.push({
      ...slot,
      configured: true,
      userName: availability.userName,
      attendanceStatus: availability.attendanceStatus,
      operationalState: availability.operationalState,
      available: verdict.available,
      reason: verdict.reason,
    });
    if (verdict.available && !owner) {
      owner = {
        userUuid: slot.userUuid,
        userName: availability.userName,
        role: slot.role,
        reason: verdict.reason,
      };
    }
  }

  return {
    responsibility_uuid: responsibility.responsibility_uuid,
    name: responsibility.name,
    category,
    isCritical: !!responsibility.isCritical,
    configured: chainFields(responsibility),
    chain,
    currentOwner: owner,
    escalated: !owner,
    // Surfaced verbatim by the UI so an uncovered responsibility is loud
    // rather than a silently empty row.
    warning: owner ? '' : 'NO AVAILABLE OWNER',
  };
};

/** Resolve every active responsibility for a date, with the team availability map. */
const resolveAllResponsibilities = async ({ date = new Date() } = {}) => {
  const [storeSettings, responsibilities, users] = await Promise.all([
    getStoreSettings(),
    Responsibility.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    User.find({}).select('-Password').lean(),
  ]);

  const availabilityMap = await buildAvailabilityMap(users, { date, storeSettings });
  const resolved = responsibilities.map((responsibility) =>
    resolveResponsibilityOwner(responsibility, availabilityMap)
  );

  const escalations = resolved.filter((item) => item.escalated);
  const escalationTargets = escalations.length ? await resolveEscalationTargets(storeSettings) : [];

  return { resolved, availabilityMap, users, storeSettings, escalations, escalationTargets };
};

// ── Configuration validation (§35) ─────────────────────────────────────────

/**
 * Warnings, not save blocks: a half-configured chain should be visible on the
 * screen that can fix it, not rejected at the API and lost.
 */
const validateConfiguration = ({ responsibilities, availabilityMap, users }) => {
  const warnings = [];
  const byUuid = new Map(users.map((user) => [user.User_uuid, user]));

  for (const responsibility of responsibilities) {
    const label = responsibility.name;
    const { primaryUserUuid } = responsibility;
    const backupUuids = BACKUP_FIELDS.map((field) => responsibility[field]).filter(Boolean);

    if (!primaryUserUuid) {
      warnings.push({
        level: responsibility.isCritical ? 'error' : 'warning',
        responsibility: label,
        responsibility_uuid: responsibility.responsibility_uuid,
        message: 'No primary user assigned',
      });
    }
    if (responsibility.isCritical && !backupUuids.length) {
      warnings.push({
        level: 'error',
        responsibility: label,
        responsibility_uuid: responsibility.responsibility_uuid,
        message: 'Critical responsibility has no backup cover',
      });
    }

    for (const slot of OWNERSHIP_SLOTS) {
      const slotLabel = slot.label;
      const uuid = responsibility[slot.field];
      if (!uuid) continue;
      // A virtual operator is not a User row, so existence is checked against
      // the availability map, which carries both.
      if (!byUuid.has(uuid) && !availabilityMap.has(uuid)) {
        warnings.push({
          level: 'error',
          responsibility: label,
          responsibility_uuid: responsibility.responsibility_uuid,
          message: `${slotLabel} points at a user that no longer exists`,
        });
        continue;
      }
      const availability = availabilityMap.get(uuid);
      if (availability && !availability.operationsActive) {
        warnings.push({
          level: 'warning',
          responsibility: label,
          responsibility_uuid: responsibility.responsibility_uuid,
          message: `${slotLabel} (${availability.userName}) is inactive in operations`,
        });
      }
      if (slot.role !== 'primary' && availability && !availability.backupEligible) {
        warnings.push({
          level: 'warning',
          responsibility: label,
          responsibility_uuid: responsibility.responsibility_uuid,
          message: `${slotLabel} (${availability.userName}) is not marked backup eligible`,
        });
      }
    }

    const assigned = [primaryUserUuid, ...backupUuids].filter(Boolean);
    if (new Set(assigned).size !== assigned.length) {
      warnings.push({
        level: 'warning',
        responsibility: label,
        responsibility_uuid: responsibility.responsibility_uuid,
        message: 'The same user is assigned to more than one slot',
      });
    }
  }

  return warnings;
};

/** Duplicate-priority detector — two active users holding the same code. */
const findPriorityConflicts = (users) => {
  const byPriority = new Map();
  for (const user of users) {
    const priority = user.operations?.priority;
    if (!priority || user.operations?.active === false) continue;
    if (!byPriority.has(priority)) byPriority.set(priority, []);
    byPriority.get(priority).push({ User_uuid: user.User_uuid, User_name: user.User_name });
  }
  return [...byPriority.entries()]
    .filter(([, holders]) => holders.length > 1)
    .map(([priority, holders]) => ({ priority, holders }));
};

// ── Audit helper ───────────────────────────────────────────────────────────

const recordAudit = async (entry) => {
  try {
    await OperationsAuditLog.create(entry);
  } catch {
    // Auditing must never take down the operation it is recording.
  }
};

/** Diff two objects and write one audit row per changed field. */
const auditFieldChanges = async ({ before = {}, after = {}, fields, base }) => {
  const rows = [];
  for (const field of fields) {
    const oldValue = before?.[field];
    const newValue = after?.[field];
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
    rows.push({ ...base, field, oldValue: oldValue ?? null, newValue: newValue ?? null });
  }
  if (!rows.length) return [];
  try {
    await OperationsAuditLog.insertMany(rows);
  } catch {
    // See recordAudit.
  }
  return rows;
};

module.exports = {
  OWNERSHIP_SLOTS,
  STORE_SETTINGS_KEY,
  VIRTUAL_OPERATORS_KEY,
  DEFAULT_VIRTUAL_OPERATORS,
  getVirtualOperators,
  PRIORITY_LEVELS_KEY,
  DEPARTMENTS_KEY,
  STAGE_RESPONSIBILITIES_KEY,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_PRIORITY_LEVELS,
  DEFAULT_DEPARTMENTS,
  RESPONSIBILITY_CATEGORIES,
  OPERATIONAL_STATES,
  AVAILABLE_ATTENDANCE,
  getStoreSettings,
  getPriorityLevels,
  getDepartments,
  getStageResponsibilities,
  parseClockMinutes,
  deriveAttendanceStatus,
  isAvailableFor,
  buildAvailabilityMap,
  resolveEscalationTargets,
  resolveResponsibilityOwner,
  resolveAllResponsibilities,
  validateConfiguration,
  findPriorityConflicts,
  recordAudit,
  auditFieldChanges,
};
