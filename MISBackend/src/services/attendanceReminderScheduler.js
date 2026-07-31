const User = require('../repositories/users');
const Attendance = require('../repositories/attendance');
const {
  getAttendanceConfig,
  getCurrentAttendanceType,
  getIstDate,
} = require('./whatsappAttendanceService');
const { renderTemplate } = require('./whatsappTemplateService');
const logger = require('../utils/logger');

// Daily "Good morning, are you coming in today?" broadcast — sent to every
// employee at 8 AM IST, skipped entirely on a configured weekly-off day, and
// skipped per-employee if they've already marked attendance some other way.
async function sendDailyAttendanceCheckIn({ sendText, sendButtons }) {
  const config = await getAttendanceConfig();
  if (!config.enabled) return;

  const nowIst = getIstDate(new Date());
  if ((config.weeklyOffDays || [0]).includes(nowIst.getDay())) return;

  const todayDateOnly = new Date(nowIst.toISOString().split('T')[0]);
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

let lastCheckInRun = '';

function initAttendanceReminderScheduler({ sendText, sendButtons }) {
  setInterval(() => {
    const nowIst = getIstDate(new Date());
    const key = nowIst.toISOString().slice(0, 10);
    if (nowIst.getHours() === 8 && nowIst.getMinutes() === 0 && lastCheckInRun !== key) {
      lastCheckInRun = key;
      sendDailyAttendanceCheckIn({ sendText, sendButtons }).catch((err) => {
        logger.error('[attendance-checkin] scheduler run failed:', err);
      });
    }
  }, 60 * 1000);
}

module.exports = { initAttendanceReminderScheduler, sendDailyAttendanceCheckIn };
