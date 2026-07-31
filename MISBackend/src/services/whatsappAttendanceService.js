const User = require('../repositories/users');
const Attendance = require('../repositories/attendance');
const { AppSetting } = require('../repositories/appSetting');
const { markAttendance, isTransitionAllowed } = require('./attendanceService');
const { getPendingOrdersForUser, buildTaskSummaryMessage, rolloverPendingOrders } = require('./orderTaskService');
const WhatsAppPendingInput = require('../repositories/WhatsAppPendingInput');
const AttendanceAbsence = require('../repositories/AttendanceAbsence');
const { sendWhatsAppText } = require('./unifiedWhatsAppService');
const { tierFor } = require('../utils/roleHierarchy');
const { renderTemplate } = require('./whatsappTemplateService');
const logger = require('../utils/logger');
// buildOrderListSections is lazy-required inside sendPendingTaskList() —
// whatsappOrderCommandService.js -> whatsappIdentityService.js already
// requires this file at the top level, so a top-level require here would
// close a circular-require loop.

const SETTING_KEY = 'whatsapp_attendance_config';
const ABSENCE_PENDING_TTL_MS = 15 * 60 * 1000;

const DEFAULT_CONFIG = {
  enabled: true,
  markUnknownNumbers: false,
  unknownNumberReply: 'Your number is not registered. Contact admin.',
  duplicateReply: 'Attendance for this action is already marked today.',
  invalidTransitionReply: 'This command is not allowed right now.',
  weeklyOffDays: [0], // JS Date#getDay() values, 0 = Sunday
  commands: [
    {
      key: 'start',
      label: 'Day Start',
      aliases: ['start', 'hi'],
      attendanceType: 'In',
      nextAllowed: ['Lunch Out', 'Out'],
      successMessage: 'Attendance marked. Start time {{time}}.',
      duplicateMessage: 'Attendance start already marked today.',
      invalidMessage: 'Day start is already marked.',
      enabled: true,
    },
    {
      key: 'lunch',
      label: 'Lunch Break',
      aliases: ['lunch', 'break'],
      attendanceType: 'Lunch Out',
      nextAllowed: ['Lunch In'],
      successMessage: 'Lunch break marked at {{time}}.',
      duplicateMessage: 'Lunch break already marked.',
      invalidMessage: 'Lunch break can only be marked after start.',
      enabled: true,
    },
    {
      key: 'restart',
      label: 'Restart After Lunch',
      aliases: ['restart', 'back', 'resume'],
      attendanceType: 'Lunch In',
      nextAllowed: ['Out'],
      successMessage: 'Back from lunch marked at {{time}}.',
      duplicateMessage: 'Back from lunch already marked.',
      invalidMessage: 'Restart can only be used after lunch break.',
      enabled: true,
    },
    {
      key: 'end',
      label: 'Day End',
      aliases: ['end', 'done', 'close'],
      attendanceType: 'Out',
      nextAllowed: [],
      successMessage: 'Day end marked at {{time}}.',
      duplicateMessage: 'Day end already marked.',
      invalidMessage: 'Day end can only be marked after start.',
      enabled: true,
    },
  ],
};

function normalizeAliases(list = []) {
  return [...new Set(list.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function normalizeWeeklyOffDays(list) {
  if (!Array.isArray(list)) return [...DEFAULT_CONFIG.weeklyOffDays];
  const days = [...new Set(list.map((value) => Number(value)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
  return days.length ? days : [...DEFAULT_CONFIG.weeklyOffDays];
}

async function getAttendanceConfig() {
  let value = await AppSetting.getSetting(SETTING_KEY, null);
  if (!value) {
    await AppSetting.upsertSetting({
      key: SETTING_KEY,
      value: DEFAULT_CONFIG,
      description: 'WhatsApp attendance command configuration',
    });
    value = DEFAULT_CONFIG;
  }

  return {
    ...DEFAULT_CONFIG,
    ...value,
    weeklyOffDays: normalizeWeeklyOffDays(value?.weeklyOffDays),
    commands: Array.isArray(value?.commands) && value.commands.length > 0
      ? value.commands.map((command) => ({
          ...command,
          aliases: normalizeAliases(command.aliases),
        }))
      : DEFAULT_CONFIG.commands,
  };
}

async function saveAttendanceConfig(payload) {
  const sanitized = {
    enabled: payload?.enabled !== false,
    markUnknownNumbers: Boolean(payload?.markUnknownNumbers),
    unknownNumberReply: String(payload?.unknownNumberReply || DEFAULT_CONFIG.unknownNumberReply),
    duplicateReply: String(payload?.duplicateReply || DEFAULT_CONFIG.duplicateReply),
    invalidTransitionReply: String(payload?.invalidTransitionReply || DEFAULT_CONFIG.invalidTransitionReply),
    weeklyOffDays: normalizeWeeklyOffDays(payload?.weeklyOffDays),
    commands: Array.isArray(payload?.commands)
      ? payload.commands.map((command, index) => ({
          key: String(command?.key || `command_${index + 1}`).trim().toLowerCase(),
          label: String(command?.label || command?.key || `Command ${index + 1}`).trim(),
          aliases: normalizeAliases(command?.aliases),
          attendanceType: String(command?.attendanceType || '').trim(),
          nextAllowed: Array.isArray(command?.nextAllowed)
            ? command.nextAllowed.map((value) => String(value || '').trim()).filter(Boolean)
            : [],
          successMessage: String(command?.successMessage || ''),
          duplicateMessage: String(command?.duplicateMessage || ''),
          invalidMessage: String(command?.invalidMessage || ''),
          enabled: command?.enabled !== false,
        })).filter((command) => command.attendanceType && command.aliases.length > 0)
      : DEFAULT_CONFIG.commands,
  };

  await AppSetting.upsertSetting({
    key: SETTING_KEY,
    value: sanitized,
    description: 'WhatsApp attendance command configuration',
  });

  return sanitized;
}

function normalizePhoneForLookup(phone) {
  return String(phone || '').replace(/\D/g, '');
}

async function findEmployeeByWhatsAppNumber(rawPhone) {
  const normalizedPhone = normalizePhoneForLookup(rawPhone);
  if (!normalizedPhone) return null;
  const last10 = normalizedPhone.slice(-10);

  return User.findOne({
    $or: [
      { phone: normalizedPhone },
      { phone: `+${normalizedPhone}` },
      { phone: last10 },
      { Mobile_number: last10 },
      {
        $expr: {
          $eq: [{ $toString: '$Mobile_number' }, last10],
        },
      },
    ],
  }).lean();
}

function getIstDate(date = new Date()) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatMessage(template, values) {
  let text = String(template || '');
  Object.entries(values || {}).forEach(([key, value]) => {
    text = text.replaceAll(`{{${key}}}`, String(value ?? ''));
  });
  return text;
}

function getCurrentAttendanceType(attendance) {
  return attendance?.User?.length ? attendance.User[attendance.User.length - 1]?.Type : null;
}

function getApplicableCommands({ config, attendance }) {
  const hasAttendance = Boolean(attendance);
  const currentType = getCurrentAttendanceType(attendance);
  return (config.commands || []).filter(
    (cmd) => cmd.enabled && isTransitionAllowed({ hasAttendance, currentType, attendanceType: cmd.attendanceType })
  );
}

// "Today" as a UTC-midnight-bucketed Date, same idiom as Attendance.Date.
function computeIstDateOnly(base = new Date()) {
  const ist = getIstDate(base);
  return new Date(ist.toISOString().split('T')[0]);
}

// ── WhatsAppPendingInput helpers, local to the attendance-absence flow ─────
// (whatsappOrderCommandService.js has its own private setPending/clearPending
// over the same collection — kept separate rather than exported/shared, both
// files independently key off `action` to decide "is this pending doc mine?")

async function getAttendanceAbsencePending(phone) {
  const doc = await WhatsAppPendingInput.findOne({
    phone: normalizePhoneForLookup(phone),
    action: 'attendanceAbsence',
  }).lean();
  return doc || null;
}

async function setAttendancePending(phone, fields) {
  await WhatsAppPendingInput.findOneAndUpdate(
    { phone: normalizePhoneForLookup(phone) },
    { $set: { ...fields, expiresAt: new Date(Date.now() + ABSENCE_PENDING_TTL_MS) } },
    { upsert: true }
  );
}

async function clearAttendancePending(phone) {
  await WhatsAppPendingInput.deleteOne({ phone: normalizePhoneForLookup(phone) });
}

// ── Pending task list, shown after every activity ───────────────────────────

async function sendPendingTaskList({ employee, payload, sendText, sendList, introText }) {
  await rolloverPendingOrders();
  const taskResult = await getPendingOrdersForUser(employee);
  const orders = taskResult.orders || [];
  const name = employee.name || employee.User_name || 'there';

  if (!orders.length) {
    if (sendText) {
      let body = introText;
      if (!body) {
        ({ body } = await renderTemplate('task.summary_none', { name }));
      }
      await sendText({ to: payload.from, body });
    }
    return;
  }

  if (sendList) {
    // Lazy require — see the top-of-file note on the circular-require hazard.
    const { buildOrderListSections } = require('./whatsappOrderCommandService');
    const sections = await buildOrderListSections(orders.slice(0, 10));
    let bodyText = introText;
    let listButtonLabel = 'View tasks';
    if (!bodyText) {
      ({ body: bodyText, listButtonLabel } = await renderTemplate('task.list_intro', {
        name,
        count: orders.length,
        plural: orders.length === 1 ? '' : 's',
      }));
    }
    await sendList({
      to: payload.from,
      bodyText,
      buttonLabel: listButtonLabel,
      sections,
    });
    return;
  }

  if (sendText) {
    await sendText({ to: payload.from, body: await buildTaskSummaryMessage({ employee, orders }) });
  }
}

// ── "Not Coming Today" button tap ───────────────────────────────────────────

async function handleNotComingTodayTap({ employee, payload, sendText }) {
  const forDate = computeIstDateOnly();

  await setAttendancePending(payload.from, {
    action: 'attendanceAbsence',
    step: 'awaiting_reason',
    orderUuid: '',
    data: {
      employeeUuid: employee.User_uuid,
      employeeName: employee.name || employee.User_name || '',
      forDate,
    },
  });

  if (sendText) {
    const { body } = await renderTemplate('attendance.absence_reason_prompt');
    await sendText({ to: payload.from, body });
  }

  return { handled: true, success: true, reason: 'absence_reason_prompted' };
}

async function notifyOfficeUsersOfAbsence({ employeeUuid, employeeName, forDate, reason }) {
  const { body } = await renderTemplate('attendance.office_absence_notify', {
    employeeName: employeeName || 'An employee',
    date: forDate.toLocaleDateString('en-IN'),
    reason,
  });
  const recipients = new Set();

  const ownerMobile = normalizePhoneForLookup(process.env.OWNER_WHATSAPP_NUMBER);
  if (ownerMobile) recipients.add(ownerMobile);

  const users = await User.find({}).lean();
  for (const u of users) {
    if (u.User_uuid === employeeUuid) continue; // don't notify the person who's absent
    if (tierFor(u.User_group) >= 2) { // Office User tier and above
      const mobile = normalizePhoneForLookup(u.Mobile_number);
      if (mobile) recipients.add(mobile);
    }
  }

  for (const mobile of recipients) {
    try {
      await sendWhatsAppText({ to: mobile, body, source: 'ATTENDANCE_ABSENCE', activity: 'ATTENDANCE' });
    } catch (err) {
      logger.error(`[attendance] Failed to notify ${mobile} of absence:`, err.message);
    }
  }
}

async function handleAbsenceReasonReply({ pending, payload, sendText, rawText }) {
  const reason = String(rawText || '').trim().slice(0, 300);
  if (!reason) {
    if (sendText) {
      const { body } = await renderTemplate('attendance.absence_empty_reason');
      await sendText({ to: payload.from, body });
    }
    return { handled: true, success: false, reason: 'empty_reason' };
  }

  await clearAttendancePending(payload.from);

  const employeeUuid = pending.data?.employeeUuid || '';
  const employeeName = pending.data?.employeeName || '';
  const forDate = pending.data?.forDate ? new Date(pending.data.forDate) : computeIstDateOnly();

  await AttendanceAbsence.create({
    Employee_uuid: employeeUuid,
    Employee_name: employeeName,
    phone: normalizePhoneForLookup(payload.from),
    forDate,
    reason,
  });

  if (sendText) {
    const { body } = await renderTemplate('attendance.absence_ack');
    await sendText({ to: payload.from, body });
  }

  // Fire-and-forget: pure side-channel notify, must not block the employee's ack.
  notifyOfficeUsersOfAbsence({ employeeUuid, employeeName, forDate, reason }).catch((err) => {
    logger.error('[attendance] Failed to notify office users of absence:', err);
  });

  return { handled: true, success: true, reason: 'absence_captured' };
}

// ── Mark-and-reply, shared by the typed-keyword and button-tap paths ───────

async function executeAttendanceCommand({ config, command, employee, payload, sendText, sendButtons, sendList, sourceLabel }) {
  const eventTime = getIstDate(new Date());
  const attendanceDate = new Date(eventTime.toISOString().split('T')[0]);
  let attendance = await Attendance.findOne({ Employee_uuid: employee.User_uuid, Date: attendanceDate });
  const currentType = getCurrentAttendanceType(attendance);
  const attendanceType = command.attendanceType;

  const isAllowed = isTransitionAllowed({ hasAttendance: Boolean(attendance), currentType, attendanceType });

  if (!isAllowed) {
    if (sendText) {
      await sendText({ to: payload.from, body: command.invalidMessage || config.invalidTransitionReply });
    }
    return { handled: true, success: false, reason: 'invalid_transition' };
  }

  if (!attendance) {
    const result = await markAttendance({
      employeeUuid: employee.User_uuid,
      type: attendanceType,
      status: 'Present',
      time: eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'whatsapp',
      createdAt: eventTime,
      addInitialEntry: true,
    });
    attendance = result.attendance;
  } else {
    const duplicate = attendance.User.some((entry) => entry.Type === attendanceType);
    if (duplicate) {
      if (sendText) {
        await sendText({ to: payload.from, body: command.duplicateMessage || config.duplicateReply });
      }
      return { handled: true, success: false, reason: 'duplicate' };
    }

    attendance.User.push({
      Type: attendanceType,
      Time: eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      CreatedAt: eventTime,
      SourceCommand: sourceLabel,
    });
    attendance.Status = attendanceType === 'Out' ? 'Completed' : 'Present';
    attendance.source = 'whatsapp';
    await attendance.save();
  }

  if (sendText) {
    await sendText({
      to: payload.from,
      body: formatMessage(command.successMessage, {
        time: eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name: employee.name || employee.User_name || 'User',
        command: sourceLabel,
      }),
    });
  }

  if (sendText) {
    // Every mark (In / Lunch Out / Lunch In / Out) gets the same
    // interactive-task-list follow-up — Day End is not special-cased.
    await sendPendingTaskList({ employee, payload, sendText, sendList });
  }

  return { handled: true, success: true, attendanceType, employee, attendance };
}

async function sendApplicableAttendanceButtons({ config, employee, payload, sendText, sendButtons, introText }) {
  const eventTime = getIstDate(new Date());
  const attendanceDate = new Date(eventTime.toISOString().split('T')[0]);
  const attendance = await Attendance.findOne({ Employee_uuid: employee.User_uuid, Date: attendanceDate });
  const applicable = getApplicableCommands({ config, attendance });

  const buttons = applicable.slice(0, 2).map((cmd) => ({
    id: `attn:mark:${cmd.key}`,
    title: String(cmd.label || cmd.key).slice(0, 20),
  }));
  const { body: updateButtonLabel } = await renderTemplate('attendance.update_button');
  buttons.push({ id: 'attn:update', title: updateButtonLabel });

  const name = employee.name || employee.User_name || 'there';
  let bodyText = introText;
  if (!bodyText) {
    const { body } = await renderTemplate(applicable.length ? 'attendance.menu_active' : 'attendance.menu_complete', { name });
    bodyText = body;
  }

  if (sendButtons) {
    await sendButtons({ to: payload.from, bodyText, buttons });
  } else if (sendText) {
    await sendText({ to: payload.from, body: bodyText });
  }

  return { handled: true, success: true, reason: 'menu_sent' };
}

async function sendAttendanceUpdate({ config, employee, payload, sendText, sendButtons, sendList }) {
  const eventTime = getIstDate(new Date());
  const attendanceDate = new Date(eventTime.toISOString().split('T')[0]);
  const attendance = await Attendance.findOne({ Employee_uuid: employee.User_uuid, Date: attendanceDate }).lean();

  let statusLines;
  if (attendance?.User?.length) {
    statusLines = attendance.User.map((entry) => `${entry.Type}: ${entry.Time}`).join('\n');
  } else {
    ({ body: statusLines } = await renderTemplate('attendance.no_marks_yet'));
  }

  const { body: introText } = await renderTemplate('attendance.today_summary', { statusLines });

  // Status is merged into the task list's intro text (rather than sent as its
  // own message first) so an Update tap stays at 2 outbound messages total
  // (status+list, then buttons), same as before task lists were added here.
  await sendPendingTaskList({
    employee,
    payload,
    sendText,
    sendList,
    introText,
  });

  return sendApplicableAttendanceButtons({ config, employee, payload, sendText, sendButtons });
}

async function processWhatsAppAttendanceCommand({ payload, sendText, sendButtons, sendList }) {
  const config = await getAttendanceConfig();
  if (!config.enabled) return { handled: false };

  const rawText = String(payload?.message || payload?.text || '').trim();
  if (!rawText) return { handled: false };

  // Must run before alias matching and before any early `handled:false`
  // return — an unclaimed pending absence-reason doc would otherwise be
  // silently wiped by handleWhatsAppOrderCommand's own pending-cleanup
  // fallthrough once this function falls through to it.
  const absencePending = await getAttendanceAbsencePending(payload?.from);
  if (absencePending) {
    return handleAbsenceReasonReply({ pending: absencePending, payload, sendText, rawText });
  }

  const incomingText = rawText.toLowerCase();
  const command = (config.commands || []).find((entry) => entry.enabled && entry.aliases.includes(incomingText));
  if (!command) return { handled: false };

  const employee = await findEmployeeByWhatsAppNumber(payload?.from);
  if (!employee) {
    if (config.markUnknownNumbers && sendText) {
      await sendText({ to: payload.from, body: config.unknownNumberReply });
    }
    return { handled: true, success: false, reason: 'unknown_number' };
  }

  // "Day start" opens the button menu instead of marking instantly, so the
  // employee can see which action is actually valid right now. Every other
  // command (lunch/restart/end and their aliases) still marks immediately.
  if (command.attendanceType === 'In') {
    return sendApplicableAttendanceButtons({ config, employee, payload, sendText, sendButtons });
  }

  return executeAttendanceCommand({ config, command, employee, payload, sendText, sendButtons, sendList, sourceLabel: incomingText });
}

async function processWhatsAppAttendanceButtonTap({ payload, sendText, sendButtons, sendList }) {
  const replyId = String(payload?.replyId || '');
  if (!replyId.startsWith('attn:')) return { handled: false };

  const config = await getAttendanceConfig();
  if (!config.enabled) {
    if (sendText) {
      const { body } = await renderTemplate('attendance.disabled_reply');
      await sendText({ to: payload.from, body });
    }
    return { handled: true, success: false, reason: 'disabled' };
  }

  const employee = await findEmployeeByWhatsAppNumber(payload?.from);
  if (!employee) {
    if (config.markUnknownNumbers && sendText) {
      await sendText({ to: payload.from, body: config.unknownNumberReply });
    }
    return { handled: true, success: false, reason: 'unknown_number' };
  }

  const [, action, arg] = replyId.split(':');

  if (action === 'update') {
    return sendAttendanceUpdate({ config, employee, payload, sendText, sendButtons, sendList });
  }

  if (action === 'today') {
    if (arg === 'absent') return handleNotComingTodayTap({ employee, payload, sendText });
    return { handled: false };
  }

  if (action === 'mark') {
    const command = (config.commands || []).find((cmd) => cmd.enabled && cmd.key === arg);
    if (!command) {
      if (sendText) {
        await sendText({ to: payload.from, body: config.invalidTransitionReply });
      }
      await sendApplicableAttendanceButtons({ config, employee, payload, sendText, sendButtons });
      return { handled: true, success: false, reason: 'unknown_command' };
    }

    await executeAttendanceCommand({ config, command, employee, payload, sendText, sendButtons, sendList, sourceLabel: `button:${command.key}` });
    // Always re-show the current buttons, whether the mark succeeded, hit a
    // duplicate, or was rejected as an invalid transition — this is a
    // button-driven menu, so a stale/double tap should never dead-end it.
    return sendApplicableAttendanceButtons({ config, employee, payload, sendText, sendButtons });
  }

  return { handled: false };
}

module.exports = {
  getAttendanceConfig,
  saveAttendanceConfig,
  processWhatsAppAttendanceCommand,
  processWhatsAppAttendanceButtonTap,
  findEmployeeByWhatsAppNumber,
  getCurrentAttendanceType,
  getIstDate,
  sendApplicableAttendanceButtons,
};
