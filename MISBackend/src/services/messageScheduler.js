const ScheduledMessage = require('../repositories/ScheduledMessage');
const { sendWhatsAppText } = require('./unifiedWhatsAppService');
const Users = require('../repositories/users');
const Orders = require('../repositories/order');
const Usertasks = require('../repositories/usertask');
const DesignFileLink = require('../repositories/DesignFileLink');
const { renderTemplate } = require('./whatsappTemplateService');
const logger = require('../utils/logger');

async function processScheduledMessages() {
  const now = new Date();
  const messages = await ScheduledMessage.find({ sendAt: { $lte: now }, status: 'scheduled' });

  for (const msg of messages) {
    try {
      await sendWhatsAppText({ to: msg.to, body: msg.message, source: 'SCHEDULED', activity: 'SCHEDULED_MESSAGES' });
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
  const cleanTo = normalizeNumber(to);
  if (!cleanTo) {
    throw new Error('Recipient missing');
  }
  return sendWhatsAppText({ to: cleanTo, body, source: 'DAILY_DIGEST', activity: 'DAILY_DIGEST' });
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

  const businessName = process.env.BUSINESS_NAME || process.env.APP_NAME || 'MIS System';

  if (mode === 'evening') {
    const { body } = await renderTemplate('digest.evening', {
      userName: user.User_name,
      total,
      lines: [...orderLines, ...taskLines].join('\n'),
    });
    return body;
  }

  if (!total) {
    const { body } = await renderTemplate('digest.morning_empty', { userName: user.User_name });
    return body;
  }

  const { body } = await renderTemplate('digest.morning', {
    userName: user.User_name,
    orderLines: orderLines.join('\n') || '-',
    taskLines: taskLines.join('\n') || '-',
    total,
    businessName,
  });
  return body;
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
    const ownerMobile = process.env.OWNER_WHATSAPP_NUMBER;

    if (!ownerMobile) {
      logger.info('Daily owner summary skipped — OWNER_WHATSAPP_NUMBER not set');
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

    const { body: summary } = await renderTemplate('digest.owner_summary', {
      date: now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      activeOrders: pendingOrders.length,
      readyOrders: readyOrders.length,
      outstanding: totalOutstanding.toLocaleString('en-IN'),
    });

    await sendWhatsAppText({
      to: normalizeNumber(ownerMobile),
      body: summary,
      source: 'OWNER_SUMMARY',
      activity: 'OWNER_SUMMARY',
    });
    logger.info('Daily owner summary sent at', now.toISOString());
    return { sent: true };
  } catch (err) {
    logger.error('Failed to send daily owner summary:', err.message);
    return { sent: false, error: err.message };
  }
}

let schedulerStarted = false;
let lastMorningRun = '';
let lastEveningRun = '';
let lastOwnerSummaryRun = '';

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
        await sendStuckFilesDigest();
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

const PROOF_NUDGE_HOURS = Number(process.env.PROOF_NUDGE_HOURS || 24);

/**
 * Nudges the assigned designer when a customer hasn't responded to a sent
 * proof within PROOF_NUDGE_HOURS — the "designer forgot to follow up"
 * scenario. Skipped once any reply has arrived since the proof was sent
 * (see detectProofResponse in whatsappController.js), even if the reply's
 * wording was too ambiguous to auto-classify as approved/changes-requested.
 */
async function nudgeStalledProofs() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - PROOF_NUDGE_HOURS * 60 * 60 * 1000);

  const stalled = await DesignFileLink.find({
    $and: [
      { proofStatus: 'awaiting_response' },
      { lastProofSentAt: { $lte: cutoff } },
      { $or: [{ lastNudgeAt: null }, { lastNudgeAt: { $lte: cutoff } }] },
      {
        $expr: {
          $or: [
            { $eq: ['$lastCustomerResponseAt', null] },
            { $lt: ['$lastCustomerResponseAt', '$lastProofSentAt'] },
          ],
        },
      },
    ],
  }).lean();

  let sent = 0;
  for (const link of stalled) {
    try {
      if (!link.assignedToName) continue; // nobody to nudge — surfaced instead via the stuck-files digest
      const assignee = await Users.findOne({ User_name: link.assignedToName }).lean();
      const mobile = normalizeNumber(assignee?.Mobile_number);
      if (!mobile) continue;

      const daysWaiting = Math.max(1, Math.round((now - new Date(link.lastProofSentAt)) / (24 * 3600 * 1000)));
      const body = `Reminder: customer hasn't responded to the design proof for ${link.fileName || 'a design file'}${link.orderNumber ? ` (Order #${link.orderNumber})` : ''}, sent ${daysWaiting} day(s) ago. Please follow up with ${link.customerName || 'the customer'}.`;
      await sendWhatsAppText({ to: mobile, body, source: 'PROOF_FOLLOWUP', activity: 'PROOF_FOLLOWUP', contactName: link.assignedToName });
      await DesignFileLink.updateOne({ _id: link._id }, { $set: { lastNudgeAt: now }, $inc: { nudgeCount: 1 } });
      sent += 1;
    } catch (err) {
      logger.error(`Proof follow-up nudge failed for ${link.driveFileId}:`, err.message);
    }
  }
  return sent;
}

function initProofFollowupScheduler() {
  setInterval(async () => {
    try {
      const count = await nudgeStalledProofs();
      if (count) logger.info(`[proof-followup] Sent ${count} nudge(s)`);
    } catch (err) {
      logger.error('Proof follow-up scheduler error:', err);
    }
  }, 30 * 60 * 1000);
}

/**
 * Daily digest of design files still sitting in stages 1-4 (not yet Final)
 * past the "amber" aging threshold — the direct answer to "which files still
 * aren't finalized," pushed proactively instead of requiring someone to open
 * the dashboard and notice.
 */
async function sendStuckFilesDigest() {
  try {
    const ownerMobile = process.env.OWNER_WHATSAPP_NUMBER;
    if (!ownerMobile) {
      logger.info('Stuck files digest skipped — OWNER_WHATSAPP_NUMBER not set');
      return { skipped: true };
    }

    const amberHours = Number(process.env.STUCK_FILE_AMBER_HOURS || 48);
    const cutoff = new Date(Date.now() - amberHours * 60 * 60 * 1000);
    const stuck = await DesignFileLink.find({
      linkStatus: { $ne: 'confirmed' },
      stageNumber: { $gte: 1, $lte: 4 },
      stageEnteredAt: { $lte: cutoff },
    }).sort({ stageEnteredAt: 1 }).limit(20).lean();

    if (!stuck.length) return { skipped: true, reason: 'none stuck' };

    const now = Date.now();
    const lines = stuck.map((f) => {
      const days = Math.round((now - new Date(f.stageEnteredAt).getTime()) / (24 * 3600 * 1000));
      return `${f.fileName || f.driveFileId} — ${f.stageLabel || `stage ${f.stageNumber}`}, ${days}d, ${f.assignedToName || 'unassigned'}`;
    });

    const body = `Files not yet finalized (${stuck.length}):\n${lines.join('\n')}`;
    await sendWhatsAppText({
      to: normalizeNumber(ownerMobile),
      body,
      source: 'STUCK_FILES_DIGEST',
      activity: 'STUCK_FILES_DIGEST',
    });
    return { sent: true, count: stuck.length };
  } catch (err) {
    logger.error('Failed to send stuck files digest:', err.message);
    return { sent: false, error: err.message };
  }
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
  initTaskDigestScheduler,
  sendOwnerDailySummary,
  initAutoPOScheduler,
  initProofFollowupScheduler,
  nudgeStalledProofs,
  sendStuckFilesDigest,
};
