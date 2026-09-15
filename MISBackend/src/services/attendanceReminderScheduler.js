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

// Daily "Good morning, are you coming in today?" broadcast — sent to every
// employee at 8 AM IST, skipped entirely on a configured weekly-off day, and
// skipped per-employee if they've already marked attendance some other way.
async function sendDailyAttendanceCheckIn({ sendText, sendButtons }) {
  const config = await getAttendanceConfig();
  if (!config.enabled) return;

  const nowIst = getIstDate(new Date());
  if ((config.weeklyOffDays || [0]).includes(nowIst.getDay())) return;

  const todayDateOnly = businessDayKey(new Date());
  const users = await User.find({}).lean();

  for (const user of users) {
    try {
      const phone = String(user.Mobile_number || user.phone || '').replace(/\D/g, '');
      if (!phone || !user.User_uuid) continue;

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

// Two hours. "Are you coming in today?" is worth asking if the process woke
// late in the morning; by midday the answer is already visible in whether the
// employee turned up, and asking then reads as broken rather than helpful.
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
