const { v4: uuid } = require('uuid');
const Attendance = require('../repositories/attendance');

const ATTENDANCE_TIME_ZONE = process.env.ATTENDANCE_TIME_ZONE || 'Asia/Kolkata';

const getDateParts = (date = new Date()) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error('Invalid attendance timestamp');

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: map.year, month: map.month, day: map.day };
};

const getTodayDateString = (date = new Date()) => {
  const { year, month, day } = getDateParts(date);
  return `${year}-${month}-${day}`;
};

// Attendance.Date is a date-only key stored at UTC midnight. The key itself is
// calculated in the configured business timezone so a 00:30 IST punch cannot
// be filed under the previous UTC day.
const getDateOnly = (date = new Date()) => new Date(`${getTodayDateString(date)}T00:00:00.000Z`);

const formatAttendanceTime = (date = new Date()) => new Date(date).toLocaleTimeString('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: ATTENDANCE_TIME_ZONE,
});

// Shared attendance state machine — used by WhatsApp, dashboard and hardware
// adapters so every channel obeys the same rules against the same Attendance
// schema. Existing values are intentionally unchanged for backward compatibility.
const TRANSITION_MAP = {
  In: ['Lunch Out', 'Out'],
  'Lunch Out': ['Lunch In'],
  'Lunch In': ['Out'],
  Out: [],
};

const getCurrentAttendanceType = (attendance) =>
  attendance?.User?.length ? attendance.User[attendance.User.length - 1]?.Type : null;

const isTransitionAllowed = ({ hasAttendance, currentType, attendanceType }) => {
  if (!hasAttendance) return attendanceType === 'In';
  if (currentType === attendanceType) return false;
  if (!currentType) return attendanceType === 'In';
  return (TRANSITION_MAP[currentType] || []).includes(attendanceType);
};

const getKnownAttendanceTypes = () => Array.from(new Set([
  ...Object.keys(TRANSITION_MAP),
  ...Object.values(TRANSITION_MAP).flat(),
]));

const getNextAttendanceRecordId = async () => {
  const lastAttendanceRecord = await Attendance.findOne().sort({ Attendance_Record_ID: -1 }).lean();
  return lastAttendanceRecord ? lastAttendanceRecord.Attendance_Record_ID + 1 : 1;
};

const buildEntry = ({
  type,
  time,
  source,
  sourceCommand = '',
  createdAt,
  deviceUuid = '',
  verificationMethod = '',
  externalEventId = '',
}) => ({
  Type: type,
  Time: time || formatAttendanceTime(createdAt),
  SourceCommand: sourceCommand,
  Source: source || '',
  Device_uuid: deviceUuid || '',
  VerificationMethod: verificationMethod || '',
  ExternalEventId: externalEventId || '',
  CreatedAt: createdAt,
});

const markAttendance = async ({
  employeeUuid,
  type = 'In',
  status = 'Active',
  time = '',
  source = 'dashboard',
  sourceCommand = '',
  createdAt = new Date(),
  addInitialEntry = true,
  deviceUuid = '',
  verificationMethod = '',
  externalEventId = '',
}) => {
  if (!employeeUuid) {
    throw new Error('employeeUuid is required');
  }

  const timestamp = new Date(createdAt);
  if (Number.isNaN(timestamp.getTime())) throw new Error('Invalid attendance timestamp');
  const attendanceDate = getDateOnly(timestamp);
  const entryTime = time || formatAttendanceTime(timestamp);

  const existingAttendance = await Attendance.findOne({
    Employee_uuid: employeeUuid,
    Date: attendanceDate,
  });

  if (existingAttendance) {
    return { attendance: existingAttendance, created: false };
  }

  const nextAttendanceRecordId = await getNextAttendanceRecordId();
  const newAttendance = new Attendance({
    Attendance_uuid: uuid(),
    Attendance_Record_ID: nextAttendanceRecordId,
    Employee_uuid: employeeUuid,
    Date: attendanceDate,
    Status: status,
    source,
    User: addInitialEntry ? [buildEntry({
      type,
      time: entryTime,
      source,
      sourceCommand,
      createdAt: timestamp,
      deviceUuid,
      verificationMethod,
      externalEventId,
    })] : [],
  });

  await newAttendance.save();
  return { attendance: newAttendance, created: true };
};

// Canonical writer for new attendance channels. It is intentionally additive:
// WhatsApp and dashboard routes can continue using their existing contracts,
// while biometric/face/RFID adapters use this function and therefore share
// the same transition rules and Attendance collection.
const recordAttendanceEntry = async ({
  employeeUuid,
  type,
  status = 'Active',
  time = '',
  source = 'device',
  sourceCommand = '',
  createdAt = new Date(),
  deviceUuid = '',
  verificationMethod = '',
  externalEventId = '',
}) => {
  if (!employeeUuid) {
    const error = new Error('employeeUuid is required');
    error.statusCode = 400;
    throw error;
  }

  if (!getKnownAttendanceTypes().includes(type)) {
    const error = new Error(`Unsupported attendance type: ${type || '(empty)'}`);
    error.statusCode = 400;
    throw error;
  }

  const timestamp = new Date(createdAt);
  if (Number.isNaN(timestamp.getTime())) {
    const error = new Error('Invalid attendance timestamp');
    error.statusCode = 400;
    throw error;
  }

  const attendanceDate = getDateOnly(timestamp);
  let attendance = await Attendance.findOne({ Employee_uuid: employeeUuid, Date: attendanceDate });

  // Devices retry network requests. Treat the provider event id as idempotent
  // so a retry returns success without creating a second punch.
  if (externalEventId && attendance?.User?.some((entry) =>
    String(entry.ExternalEventId || '') === String(externalEventId) &&
    String(entry.Device_uuid || '') === String(deviceUuid || '')
  )) {
    return { attendance, created: false, appended: false, duplicate: true };
  }

  const currentType = getCurrentAttendanceType(attendance);
  const allowed = isTransitionAllowed({
    hasAttendance: Boolean(attendance),
    currentType,
    attendanceType: type,
  });

  if (!allowed) {
    const error = new Error('This attendance type is not allowed right now.');
    error.statusCode = 409;
    error.code = 'INVALID_ATTENDANCE_TRANSITION';
    throw error;
  }

  if (!attendance) {
    const result = await markAttendance({
      employeeUuid,
      type,
      status,
      time,
      source,
      sourceCommand,
      createdAt: timestamp,
      deviceUuid,
      verificationMethod,
      externalEventId,
    });
    return { attendance: result.attendance, created: true, appended: false, duplicate: false };
  }

  attendance.User.push(buildEntry({
    type,
    time,
    source,
    sourceCommand,
    createdAt: timestamp,
    deviceUuid,
    verificationMethod,
    externalEventId,
  }));
  if (type === 'Out') attendance.Status = 'Completed';
  await attendance.save();

  return { attendance, created: false, appended: true, duplicate: false };
};

module.exports = {
  markAttendance,
  recordAttendanceEntry,
  getTodayDateString,
  getDateOnly,
  formatAttendanceTime,
  ATTENDANCE_TIME_ZONE,
  TRANSITION_MAP,
  getKnownAttendanceTypes,
  getCurrentAttendanceType,
  isTransitionAllowed,
};
