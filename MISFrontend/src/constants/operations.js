// Presentation-only helpers for the Team Operations screens.
//
// Nothing here decides *who* holds a priority or a responsibility — that lives
// entirely in the database and is edited from the UI. These are labels and
// colours for values the API returns.

export const ATTENDANCE_COLORS = {
  Present: 'success',
  Late: 'warning',
  'Half Day': 'warning',
  'On Break': 'info',
  'On Leave': 'default',
  'Weekly Off': 'default',
  'Day Closed': 'default',
  Absent: 'error',
};

export const STATE_COLORS = {
  Available: 'success',
  Busy: 'warning',
  Outside: 'info',
};

export const CATEGORY_LABELS = {
  outside_logistics: 'Outside Logistics',
  inside_store: 'Inside Store',
  customer: 'Customer',
  design: 'Design',
  production: 'Production',
  marketing: 'Marketing',
  accounts: 'Accounts',
  general: 'General',
};

/**
 * The ownership chain, in strict fallback order — the same slots the API
 * stores on a responsibility. Adding a slot here is all the Responsibilities
 * screen needs to show and edit a deeper chain.
 */
export const OWNERSHIP_SLOTS = [
  { role: 'primary', field: 'primaryUserUuid', label: 'Primary' },
  { role: 'backup1', field: 'backup1UserUuid', label: 'Backup 1' },
  { role: 'backup2', field: 'backup2UserUuid', label: 'Backup 2' },
  { role: 'backup3', field: 'backup3UserUuid', label: 'Backup 3' },
  { role: 'backup4', field: 'backup4UserUuid', label: 'Backup 4' },
];

export const OWNER_ROLE_LABELS = {
  ...Object.fromEntries(OWNERSHIP_SLOTS.map((slot) => [slot.role, slot.label])),
  escalated: 'Escalated',
};

export const BUCKET_META = [
  { key: 'overdue', label: 'Overdue', dot: '🔴', color: 'error' },
  { key: 'due_soon', label: 'Due Soon', dot: '🟠', color: 'warning' },
  { key: 'in_progress', label: 'In Progress', dot: '🔵', color: 'info' },
  { key: 'waiting', label: 'Waiting', dot: '🟡', color: 'warning' },
  { key: 'completed', label: 'Completed', dot: '🟢', color: 'success' },
];

export const WEEK_DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export const categoryLabel = (value) => CATEGORY_LABELS[value] || value || 'General';
export const attendanceColor = (value) => ATTENDANCE_COLORS[value] || 'default';
export const stateColor = (value) => STATE_COLORS[value] || 'default';
export const ownerRoleLabel = (value) => OWNER_ROLE_LABELS[value] || value || '';

/** "P1 — Creative & Design Head", or whichever half is actually configured. */
export const describeUserRole = (operations = {}) =>
  [operations.priority, operations.roleTitle].filter(Boolean).join(' — ');

export const formatWeekDays = (days) => {
  if (!Array.isArray(days) || !days.length) return 'Not set';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEK_DAYS.find((entry) => entry.value === day)?.label || day)
    .join(', ');
};
