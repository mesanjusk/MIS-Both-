const { v4: uuid } = require('uuid');
const Attendance = require('../repositories/attendance');

const getTodayDateString = (date = new Date()) => date.toISOString().split('T')[0];
const getDateOnly = (date = new Date()) => { const value = new Date(date); value.setHours(0,0,0,0); return value; };

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

const getNextAttendanceRecordId = async () => {
  const lastAttendanceRecord = await Attendance.findOne().sort({ Attendance_Record_ID: -1 }).lean();
  return lastAttendanceRecord ? lastAttendanceRecord.Attendance_Record_ID + 1 : 1;
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
  const entryTime = time || new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
    User: addInitialEntry ? [{ Type: type, Time: entryTime, CreatedAt: createdAt }] : [],
  });

  await newAttendance.save();
  return { attendance: newAttendance, created: true };
};

module.exports = {
  markAttendance,
  getTodayDateString,
  getDateOnly,
  TRANSITION_MAP,
  getCurrentAttendanceType,
  isTransitionAllowed,
};
