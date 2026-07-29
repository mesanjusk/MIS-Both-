const AttendanceReminder = require('../repositories/AttendanceReminder');
const Attendance = require('../repositories/attendance');
const {
  getAttendanceConfig,
  getCurrentAttendanceType,
  getIstDate,
  sendApplicableAttendanceButtons,
  findEmployeeByWhatsAppNumber,
} = require('./whatsappAttendanceService');
const logger = require('../utils/logger');

async function processDueAttendanceReminders({ sendText, sendButtons }) {
  // Must go through the same IST shift used when fireAt was computed at
  // schedule time — comparing against a raw `new Date()` here would misfire
  // by whatever offset the server's OS timezone introduces.
  const nowIstShifted = getIstDate(new Date());
  const due = await AttendanceReminder.find({ status: 'pending', fireAt: { $lte: nowIstShifted } });

  for (const reminder of due) {
    try {
      const attendanceDate = new Date(nowIstShifted.toISOString().split('T')[0]);
      const attendance = await Attendance.findOne({
        Employee_uuid: reminder.employeeUuid,
        Date: attendanceDate,
      }).lean();

      if (getCurrentAttendanceType(attendance) !== null) {
        reminder.status = 'skipped';
        await reminder.save();
        continue;
      }

      const employee = await findEmployeeByWhatsAppNumber(reminder.phone);
      if (!employee) {
        reminder.status = 'failed';
        reminder.error = 'employee not found';
        await reminder.save();
        continue;
      }

      const config = await getAttendanceConfig();
      await sendApplicableAttendanceButtons({
        config,
        employee,
        payload: { from: reminder.phone },
        sendText,
        sendButtons,
        introText: `Good morning ${employee.name || employee.User_name || ''}! Ready to start your day?`,
      });

      reminder.status = 'sent';
      reminder.sentAt = new Date();
      await reminder.save();
    } catch (err) {
      logger.error(`[attendance-reminder] Failed to process reminder ${reminder._id}:`, err.message);
      reminder.status = 'failed';
      reminder.error = err.message;
      await reminder.save().catch(() => {});
    }
  }
}

function initAttendanceReminderScheduler({ sendText, sendButtons }) {
  setInterval(() => {
    processDueAttendanceReminders({ sendText, sendButtons }).catch((err) => {
      logger.error('[attendance-reminder] scheduler tick failed:', err);
    });
  }, 60 * 1000);
}

module.exports = { initAttendanceReminderScheduler, processDueAttendanceReminders };
