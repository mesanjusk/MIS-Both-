const User = require('../repositories/users');
const { businessDayKey } = require('../utils/businessDay');
const Attendance = require('../repositories/attendance');
const {
  getAttendanceConfig,
  getCurrentAttendanceType,
  getIstDate,
} = require('./whatsappAttendanceService');
const { renderTemplate } = require('./whatsappTemplateService');
const { runDueJobs } = require('./dailyScheduleService');
const logger = require('../utils/logger');

// Proactive 8 AM attendance prompts are intentionally OFF by default because
// each prompt is a paid outbound WhatsApp message. Employees can still mark
// attendance by sending hi/start themselves. To explicitly restore the old
// broadcast behaviour, set dailyCheckInEnabled: true in the existing
// whatsapp_attendance_config setting.
async function sendDailyAttendanceCheckIn({ sendText, sendButtons }) {
  const config = await getAttendanceConfig();
  if (!config.enabled || config.dailyCheckInEnabled !== true) return;

  const nowIst = getIstDate(new Date());
  if ((config.weeklyOffDays || [0]).includes(nowIst.getDay())) return;

  const todayDateOnly = businessDayKey(new Date());
  const users = await User.find({}).lean();

  for (const user of users) {
    try {
      const phone = String(user.Mobile_number || user.phone || '').replace(/\D/g, '');
      if (!phone || !user.User_uuid) continue;
      if (user?.permissions?.canMarkAttendanceWhatsapp === false) continue;

      const attendance = await Attendance.findOne({
        Employee_uuid: user.User_uuid,
        Date: todayDateOnly,
      }).lean();
      if (getCurrentAttendanceType(attendance) !== null) continue;

      const { body, buttons } = await renderTemplate('attendance.checkin_prompt', { name: user.User_name || '' });
      await sendButtons({ to: phone, bodyText: body, buttons });
    } catch (err) {
      logger.error(`[attendance-checkin] Failed to send to ${user.User_name}:`, err.message);
    }
  }
}

// Two hours. This only matters when the paid proactive prompt has explicitly
// been enabled by an administrator.
const CHECK_IN_CATCH_UP_MINUTES = 2 * 60;

function initAttendanceReminderScheduler({ sendText, sendButtons }) {
  setInterval(() => {
    runDueJobs([
      {
        key: 'attendance.checkin',
        hour: 8,
        minute: 0,
        catchUpMinutes: CHECK_IN_CATCH_UP_MINUTES,
        run: () => sendDailyAttendanceCheckIn({ sendText, sendButtons }),
      },
    ]).catch((err) => {
      logger.error('[attendance-checkin] scheduler run failed:', err);
    });
  }, 60 * 1000);
}

module.exports = { initAttendanceReminderScheduler, sendDailyAttendanceCheckIn };
