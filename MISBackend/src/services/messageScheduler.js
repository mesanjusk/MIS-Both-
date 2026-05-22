const ScheduledMessage = require('../repositories/ScheduledMessage');
const { sendWhatsAppText } = require('./unifiedWhatsAppService');
const Users = require('../repositories/users');
const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const Usertasks = require('../repositories/usertask');
const { sendMessage } = require('./metaApiService');
const logger = require('../utils/logger');

async function processScheduledMessages() {
  const now = new Date();
  const messages = await ScheduledMessage.find({ sendAt: { $lte: now }, status: 'scheduled' });

  for (const msg of messages) {
    try {
      await sendWhatsAppText({ to: msg.to, body: msg.message, source: 'SCHEDULED' });
      msg.status = 'sent';
    } catch (err) {
      logger.error('Failed to send scheduled message', err);
      msg.status = 'failed';
    }
    await msg.save();
  }
}

function initScheduler() {
  // Run every 5 seconds
  setInterval(processScheduledMessages, 5000);
}

async function scheduleMessage(sessionId, to, message, sendAt) {
  return ScheduledMessage.create({ sessionId, to, message, sendAt });
}

async function getPendingMessages(sessionId) {
  return ScheduledMessage.find({ sessionId, status: 'scheduled' }).sort({ sendAt: 1 });
}

async function cancelScheduledMessage(id) {
  return ScheduledMessage.deleteOne({ _id: id, status: 'scheduled' });
}


const normalizeNumber = (value = '') => String(value || '').replace(/\D/g, '');
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d, days) => {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
};

async function sendEnvText(to, body) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const cleanTo = normalizeNumber(to);
  if (!phoneNumberId || !accessToken || !cleanTo) {
    throw new Error('WhatsApp credentials or recipient missing');
  }
  return sendMessage({
    phoneNumberId,
    accessToken,
    payload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { preview_url: false, body },
    },
  });
}

const isUserActive = (user = {}) => {
  const status = String(user.Status || user.status || user.Active || 'Active').toLowerCase();
  return !['inactive', 'false', 'disabled'].includes(status);
};

const taskIncompleteFilter = { Status: { $nin: ['Completed', 'completed', 'Done', 'done'] } };

async function buildDigestForUser(user, mode = 'morning') {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const dueLimit = mode === 'morning' ? endOfDay(addDays(now, 2)) : todayStart;

  const orderFilter = {
    assignedTo: user._id,
    stage: { $nin: ['delivered', 'paid'] },
  };
  if (mode === 'morning') orderFilter.dueDate = { $lte: dueLimit };
  else orderFilter.dueDate = { $lt: todayStart };

  const taskFilter = {
    User: user.User_name,
    ...taskIncompleteFilter,
  };
  if (mode === 'morning') taskFilter.Deadline = { $lte: dueLimit };
  else taskFilter.Deadline = { $lt: todayStart };

  const [orders, tasks] = await Promise.all([
    Orders.find(orderFilter).sort({ dueDate: 1 }).limit(20).lean(),
    Usertasks.find(taskFilter).sort({ Deadline: 1 }).limit(20).lean(),
  ]);

  if (mode === 'evening' && orders.length + tasks.length === 0) return null;

  const orderLines = orders.map((order) => `#${order.Order_Number} ${order.customerName || order.Customer_name || ''} - Due ${order.dueDate ? new Date(order.dueDate).toLocaleDateString('en-IN') : '-'}`);
  const taskLines = tasks.map((task) => `${task.Usertask_name} - Due ${task.Deadline ? new Date(task.Deadline).toLocaleDateString('en-IN') : '-'}`);
  const total = orders.length + tasks.length;

  if (mode === 'evening') {
    return `Hi ${user.User_name}, ${total} items are overdue:\n${[...orderLines, ...taskLines].join('\n')}\nPlease update status or contact manager.`;
  }

  if (!total) return `Good morning ${user.User_name}! No pending tasks today.`;
  return `Good Morning ${user.User_name}! Your tasks for today:\n\nORDERS:\n${orderLines.join('\n') || '-'}\n\nTASKS:\n${taskLines.join('\n') || '-'}\n\nTotal pending: ${total}\nHave a productive day! - MIS System`;
}

async function sendDigestToAllUsers(mode = 'morning') {
  const users = (await Users.find({}).lean()).filter(isUserActive);
  const report = [];
  for (const user of users) {
    const mobile = normalizeNumber(user.Mobile_number);
    if (!mobile) {
      report.push({ user: user.User_name, skipped: true, reason: 'No mobile number' });
      continue;
    }
    try {
      const message = await buildDigestForUser(user, mode);
      if (!message) {
        report.push({ user: user.User_name, skipped: true, reason: 'No overdue items' });
        continue;
      }
      await sendEnvText(mobile, message);
      report.push({ user: user.User_name, sent: true });
    } catch (error) {
      logger.error(`Digest failed for ${user.User_name}:`, error.message);
      report.push({ user: user.User_name, sent: false, error: error.message });
    }
  }
  return report;
}

async function sendOwnerDailySummary() {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const ownerMobile = process.env.OWNER_WHATSAPP_NUMBER;

    if (!phoneNumberId || !accessToken || !ownerMobile) {
      logger.info('Daily owner summary skipped — WhatsApp credentials or OWNER_WHATSAPP_NUMBER not set');
      return { skipped: true };
    }

    const now = new Date();
    const allOrders = await Orders.find({}).lean();
    const pendingOrders = allOrders.filter((o) => {
      const stage = String(o.stage || '').toLowerCase();
      return !['delivered', 'paid', 'cancelled'].includes(stage);
    });
    const readyOrders = allOrders.filter((o) => {
      const stage = String(o.stage || '').toLowerCase();
      return stage === 'ready' || stage === 'finished';
    });

    let totalOutstanding = 0;
    for (const order of allOrders) {
      const total = Number(order.Total_Amount || order.totalAmount || order.Amount || order.saleSubtotal || 0);
      const paid = Number(order.paidAmount || order.Paid_Amount || 0);
      if (total > paid) totalOutstanding += (total - paid);
    }

    const summary = [
      '📊 *Daily Business Summary*',
      `${now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`,
      '',
      `📋 Active Orders: ${pendingOrders.length}`,
      `🚚 Ready to Dispatch: ${readyOrders.length}`,
      `💰 Total Outstanding: ₹${totalOutstanding.toLocaleString('en-IN')}`,
      '',
      'Login to dashboard for full details.',
    ].join('\n');

    await sendMessage({
      phoneNumberId,
      accessToken,
      payload: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizeNumber(ownerMobile),
        type: 'text',
        text: { preview_url: false, body: summary },
      },
    });
    logger.info('Daily owner summary sent at', now.toISOString());
    return { sent: true };
  } catch (err) {
    logger.error('Failed to send daily owner summary:', err.message);
    return { sent: false, error: err.message };
  }
}

async function sendPaymentReminders() {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const overdueOrders = await Orders.find({
      stage: 'delivered',
      billStatus: { $ne: 'paid' },
    }).limit(20).lean();

    const eligibleOrders = overdueOrders.filter((order) => {
      const deliveredEntry = (order.stageHistory || []).findLast
        ? (order.stageHistory || []).findLast((h) => h.stage === 'delivered')
        : [...(order.stageHistory || [])].reverse().find((h) => h.stage === 'delivered');
      const deliveredAt = deliveredEntry ? new Date(deliveredEntry.timestamp) : null;
      return deliveredAt && deliveredAt < twoDaysAgo;
    });

    const customerUuids = [...new Set(eligibleOrders.map((o) => o.Customer_uuid).filter(Boolean))];
    const customers = await Customers.find({ Customer_uuid: { $in: customerUuids } }).lean();
    const customerMap = Object.fromEntries(customers.map((c) => [c.Customer_uuid, c]));

    const report = [];
    for (const order of eligibleOrders) {
      const customer = customerMap[order.Customer_uuid];
      const mobile = normalizeNumber(customer?.Mobile_number || '');
      if (!mobile) {
        report.push({ order: order.Order_Number, skipped: true, reason: 'No mobile' });
        continue;
      }
      const amount = Number(order.Total_Amount || order.totalAmount || 0);
      const paid = Number(order.paidAmount || order.Paid_Amount || 0);
      const due = amount - paid;
      const name = customer?.Customer_name || 'Customer';
      const body = `Dear ${name}, your order #${order.Order_Number} of Rs.${due.toLocaleString('en-IN')} is pending payment. Please clear at your earliest. - SK Digital`;
      try {
        await sendEnvText(mobile, body);
        report.push({ order: order.Order_Number, sent: true });
      } catch (err) {
        logger.error(`Payment reminder failed for order #${order.Order_Number}:`, err.message);
        report.push({ order: order.Order_Number, sent: false, error: err.message });
      }
    }
    logger.info(`Payment reminders sent: ${report.filter((r) => r.sent).length}/${eligibleOrders.length}`);
    return report;
  } catch (err) {
    logger.error('sendPaymentReminders error:', err.message);
    return [];
  }
}

let schedulerStarted = false;
let lastMorningRun = '';
let lastEveningRun = '';
let lastOwnerSummaryRun = '';
let lastPaymentReminderRun = '';

function initTaskDigestScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  setInterval(async () => {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const key = ist.toISOString().slice(0, 10);
    const hour = ist.getHours();
    const minute = ist.getMinutes();
    try {
      if (hour === 9 && minute === 0 && lastMorningRun !== key) {
        lastMorningRun = key;
        await sendDigestToAllUsers('morning');
      }
      if (hour === 9 && minute === 0 && lastOwnerSummaryRun !== key) {
        lastOwnerSummaryRun = key;
        await sendOwnerDailySummary();
      }
      if (hour === 10 && minute === 0 && lastPaymentReminderRun !== key) {
        lastPaymentReminderRun = key;
        await sendPaymentReminders();
      }
      if (hour === 19 && minute === 0 && lastEveningRun !== key) {
        lastEveningRun = key;
        await sendDigestToAllUsers('evening');
      }
    } catch (error) {
      logger.error('Task digest scheduler error:', error);
    }
  }, 60 * 1000);
}

let lastAutoPORun = '';

function initAutoPOScheduler() {
  setInterval(async () => {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const key = ist.toISOString().slice(0, 10);
    const hour = ist.getHours();
    const minute = ist.getMinutes();
    if (hour === 12 && minute === 0 && lastAutoPORun !== key) {
      lastAutoPORun = key;
      try {
        const { autoPurchaseOrdersFromDrive } = require('../routes/DesignFiles');
        const results = await autoPurchaseOrdersFromDrive();
        logger.info({ count: results.length }, '[auto-po] Daily 12 PM run complete');
      } catch (err) {
        logger.error({ err: err.message }, '[auto-po] Daily 12 PM run failed');
      }
    }
  }, 60 * 1000);
}

module.exports = {
  initScheduler,
  scheduleMessage,
  getPendingMessages,
  cancelScheduledMessage,
  sendDigestToAllUsers,
  sendPaymentReminders,
  initTaskDigestScheduler,
  sendOwnerDailySummary,
  initAutoPOScheduler,
};
