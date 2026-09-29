const Attendance = require('../repositories/attendance');
const SOPCompletion = require('../repositories/sopCompletion');
const SOPHandover = require('../repositories/sopHandover');
const User = require('../repositories/users');
const { businessDayKey, businessDateString } = require('../utils/businessDay');
const {
  getDailyStatus, getDailyStatusForUser, SOPTask,
} = require('./sopService');
const { OWNERSHIP_FIELDS } = require('../constants/ownership');

const hasUserChain = (task) => Boolean(task.responsibility_uuid) ||
  OWNERSHIP_FIELDS.some((field) => Boolean(task[field]));
const isAttendanceTask = (task) => task.autoVerifyKey === 'attendance_in' ||
  String(task.title || '').trim().toLowerCase() === 'mark attendance & login to mis';
const escapeDay = (now = new Date()) => businessDayKey(now);
const attendanceQuery = (employeeUuid, now = new Date()) => ({
  Employee_uuid: employeeUuid,
  $or: [
    { Business_day: businessDateString(now) },
    { Date: escapeDay(now) },
  ],
});

async function findEmployeeByUuid(uuid) {
  if (!uuid) return null;
  return User.findOne({ User_uuid: uuid }).select('User_uuid User_name User_group').lean();
}

async function getEmployeeDailyStatus(employee, now = new Date()) {
  if (!employee?.User_uuid) throw new Error('Employee identity required');
  const date = escapeDay(now);
  const [mine, group, attendance] = await Promise.all([
    getDailyStatusForUser(employee.User_uuid),
    employee.User_group ? getDailyStatus(employee.User_group) : Promise.resolve({ tasks: [] }),
    Attendance.findOne(attendanceQuery(employee.User_uuid, now)).lean(),
  ]);

  // Group tasks preserve their shared completion semantics; responsibility
  // tasks belong to one employee. Deduplicate when both systems converge.
  const tasks = [...new Map([
    ...((group.tasks || []).map((task) => [task.sop_uuid, { ...task, scope: 'group' }])),
    ...((mine.tasks || []).map((task) => [task.sop_uuid, { ...task, scope: 'personal' }])),
  ]).values()];
  const ids = tasks.map((task) => task.sop_uuid);
  const [completions, handovers] = ids.length ? await Promise.all([
    SOPCompletion.find({ sop_uuid: { $in: ids }, date }).lean(),
    SOPHandover.find({ employee_uuid: employee.User_uuid, sop_uuid: { $in: ids }, date }).lean(),
  ]) : [[], []];

  const completionMap = {};
  const handoverMap = {};
  const hasStarted = Boolean(attendance?.User?.some((entry) => entry.Type === 'In'));
  const hasEnded = Boolean(attendance?.User?.some((entry) => entry.Type === 'Out'));
  for (const record of handovers) handoverMap[record.sop_uuid] = record;
  for (const task of tasks) {
    const isPersonal = task.scope === 'personal' || hasUserChain(task);
    const completion = completions.find((record) =>
      record.sop_uuid === task.sop_uuid && (!isPersonal ||
        String(record.employee_uuid || '') === String(employee.User_uuid) ||
        (!record.employee_uuid && record.completedBy === employee.User_name))
    );
    if (completion) completionMap[task.sop_uuid] = completion;
    // Attendance already provides durable independent evidence. Never ask a
    // worker to tick "Mark attendance" again when their punch-in exists.
    else if (hasStarted && isAttendanceTask(task)) completionMap[task.sop_uuid] = {
      sop_uuid: task.sop_uuid, autoVerified: true, evidence: 'Attendance: In',
      completedByName: 'MIS automatic verification', skipped: false,
    };
  }

  const blockingTasks = tasks.filter((task) => !task.isSkippable &&
    !completionMap[task.sop_uuid] && !handoverMap[task.sop_uuid]);
  const exceptions = tasks.filter((task) => handoverMap[task.sop_uuid] &&
    !completionMap[task.sop_uuid]);
  const mandatory = tasks.filter((task) => !task.isSkippable);
  const completedCount = tasks.filter((task) => completionMap[task.sop_uuid]).length;
  return {
    tasks, completionMap, handoverMap, blockingTasks, exceptions,
    canEndDay: blockingTasks.length === 0,
    date, hasStarted, hasEnded, completedCount,
    mandatoryCount: mandatory.length,
    totalCount: tasks.length,
    employeeUuid: employee.User_uuid,
  };
}

async function saveEmployeeCompletion(employee, sopUuid, { skip = false, reason = '' } = {}) {
  const status = await getEmployeeDailyStatus(employee);
  if (!status.hasStarted || status.hasEnded) {
    const error = new Error('Punch In is required and the day must still be open.');
    error.status = 409; throw error;
  }
  const task = status.tasks.find((entry) => entry.sop_uuid === sopUuid);
  if (!task) { const error = new Error('SOP is not assigned to this employee today.'); error.status = 403; throw error; }
  if (skip && !task.isSkippable) {
    const error = new Error('Mandatory SOP cannot be skipped. Use a recorded handover instead.');
    error.status = 400; throw error;
  }
  if (skip && reason.trim().length < 3) {
    const error = new Error('Add a reason when marking an optional SOP not applicable.'); error.status = 400; throw error;
  }
  if (status.completionMap[sopUuid]) return status.completionMap[sopUuid];

  const date = status.date;
  const filter = task.scope === 'personal'
    ? { sop_uuid: sopUuid, date, employee_uuid: employee.User_uuid }
    : { sop_uuid: sopUuid, date };
  const existing = await SOPCompletion.findOne(filter);
  if (existing) return existing;
  return SOPCompletion.create({
    sop_uuid: sopUuid, date,
    employee_uuid: employee.User_uuid,
    completedBy: employee.User_name,
    completedByName: employee.User_name,
    completedAt: new Date(), skipped: skip,
    skipReason: skip ? reason.trim().slice(0, 500) : '',
    assignedGroup: employee.User_group || '',
  });
}

async function saveSopHandover(employee, sopUuid, { reason, assignedTo, kind = 'blocked' } = {}) {
  const trimmedReason = String(reason || '').trim();
  const recipient = String(assignedTo || '').trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 1000 || !recipient || recipient.length > 120) {
    const error = new Error('Provide a reason (5–1000 characters) and a handover recipient.');
    error.status = 400; throw error;
  }
  const status = await getEmployeeDailyStatus(employee);
  if (!status.hasStarted || status.hasEnded) {
    const error = new Error('Only an employee on duty can hand over today’s SOP.');
    error.status = 409; throw error;
  }
  const task = status.tasks.find((entry) => entry.sop_uuid === sopUuid);
  if (!task) { const error = new Error('SOP not assigned to this employee today.'); error.status = 403; throw error; }
  if (status.completionMap[sopUuid]) {
    const error = new Error('This SOP is already completed.'); error.status = 409; throw error;
  }
  return SOPHandover.findOneAndUpdate({
    sop_uuid: sopUuid, employee_uuid: employee.User_uuid, date: status.date,
  }, { $set: {
    kind, reason: trimmedReason, assignedTo: recipient, createdBy: employee.User_name,
    reviewStatus: 'pending',
  } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
}

async function ensureSopClockOut(employee, { emergencyReason = '', source = 'dashboard' } = {}) {
  if (!employee?.User_uuid) throw new Error('Employee identity required for SOP closing');
  const status = await getEmployeeDailyStatus(employee);
  if (status.canEndDay) return { ...status, emergency: false };
  const reason = String(emergencyReason || '').trim();
  if (reason.length < 10 || reason.length > 1000) {
    const err = new Error('Complete the mandatory SOP checklist or hand over every blocker before Punch Out. Emergency clock-out requires a reason of 10–1000 characters.');
    err.status = 409; err.code = 'SOP_PENDING';
    err.blockingTasks = status.blockingTasks.map((task) => ({
      sop_uuid: task.sop_uuid, title: task.title,
    }));
    throw err;
  }

  // Emergency exits are not fake task completions. The unresolved work is
  // escalated per employee and remains visible for review next working day.
  await Promise.all(status.blockingTasks.map((task) => SOPHandover.findOneAndUpdate({
    sop_uuid: task.sop_uuid, employee_uuid: employee.User_uuid, date: status.date,
  }, { $set: {
    kind: 'emergency', reason: reason.slice(0, 1000), assignedTo: 'Manager',
    createdBy: employee.User_name || source, reviewStatus: 'pending',
  } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true })));
  return { ...status, emergency: true, exceptionCount: status.blockingTasks.length, canEndDay: true };
}

module.exports = {
  attendanceQuery, hasUserChain, isAttendanceTask, getEmployeeDailyStatus,
  findEmployeeByUuid, saveEmployeeCompletion, saveSopHandover, ensureSopClockOut,
};
