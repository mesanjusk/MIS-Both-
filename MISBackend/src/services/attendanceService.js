const { v4: uuid } = require('uuid');
const Attendance = require('../repositories/attendance');
const attendanceNumber = require('./attendanceNumberService');
const { businessDateString, businessDayKey } = require('../utils/businessDay');

// whatsappAttendanceService historically referenced businessDayKey directly
// without importing it. Expose the shared helper on the Node global as a
// compatibility bridge so the live WhatsApp attendance path uses the same
// Asia/Kolkata business-day calculation immediately. Keep exporting it below
// for callers that import it explicitly.
global.businessDayKey = businessDayKey;

// Both were locally defined and disagreed: one produced a UTC date string, the
// other a local midnight, while the daily schedulers worked in Asia/Kolkata.
// They now share the one business-day definition (see utils/businessDay).
const getTodayDateString = (date = new Date()) => businessDateString(date);
const getDateOnly = (date = new Date()) => businessDayKey(date);

// Shared attendance state machine — used by both the WhatsApp bot and the
// dashboard so a mark made through either channel obeys the same rules
// against the same Attendance schema (see repositories/attendance.js).
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

const markAttendance = async ({
  employeeUuid,
  type = 'In',
  status = 'Active',
  time = '',
  source = 'dashboard',
  createdAt = new Date(),
  addInitialEntry = true,
}) => {
  if (!employeeUuid) {
    throw new Error('employeeUuid is required');
  }

  const attendanceDate = getDateOnly(createdAt);
  const businessDay = businessDateString(createdAt);
  const entryTime = time || new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Prefer the new stable business-day key, but keep the legacy Date fallback so
  // historical rows remain visible before the backfill migration is run.
  const existingAttendance = await Attendance.findOne({
    Employee_uuid: employeeUuid,
    $or: [
      { Business_day: businessDay },
      { Date: attendanceDate },
    ],
  });

  if (existingAttendance) {
    return { attendance: existingAttendance, created: false };
  }

  const nextAttendanceRecordId = await attendanceNumber.allocate();
  const newAttendance = new Attendance({
    Attendance_uuid: uuid(),
    Attendance_Record_ID: nextAttendanceRecordId,
    Employee_uuid: employeeUuid,
    Date: attendanceDate,
    Business_day: businessDay,
    Status: status,
    source,
    User: addInitialEntry ? [{ Type: type, Time: entryTime, CreatedAt: createdAt }] : [],
  });

  await newAttendance.save();
  return { attendance: newAttendance, created: true };
};

module.exports = {
  markAttendance,
  getTodayDateString,
  getDateOnly,
  businessDayKey,
  TRANSITION_MAP,
  getCurrentAttendanceType,
  isTransitionAllowed,
};
