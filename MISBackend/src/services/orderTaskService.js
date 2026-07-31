const mongoose = require('mongoose');
const Orders = require('../repositories/order');
const Users = require('../repositories/users');
const Customers = require('../repositories/customer');
const { sendWhatsAppText } = require('./unifiedWhatsAppService');
const { tierFor } = require('../utils/roleHierarchy');
const { renderTemplate } = require('./whatsappTemplateService');
const logger = require('../utils/logger');
const { CLOSED_STAGES } = require('../constants/orderStages');

const DESIGN_STAGE_KEYS = new Set(['enquiry', 'approved', 'design']);

function getIstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return map;
}

function buildDefaultDueDate(baseDate = new Date()) {
  const { year, month, day } = getIstDateParts(baseDate);
  return new Date(`${year}-${month}-${day}T20:00:00+05:30`);
}

function getTomorrowDueDate(baseDate = new Date()) {
  const due = buildDefaultDueDate(baseDate);
  due.setUTCDate(due.getUTCDate() + 1);
  return due;
}

function isPendingOrder(order) {
  return !CLOSED_STAGES.has(String(order?.stage || '').toLowerCase());
}

function isDesignAssignmentPending(order) {
  if (!isPendingOrder(order)) return false;
  const latestStatusTask = Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
  const taskLower = String(latestStatusTask?.Task || order?.stage || '').trim().toLowerCase();
  return taskLower.includes('design') || DESIGN_STAGE_KEYS.has(taskLower);
}

function decorateOrder(order, now = new Date()) {
  const due = order?.dueDate ? new Date(order.dueDate) : null;
  const latestStatusTask = Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
  return {
    ...order,
    latestStatusTask,
    overdue: Boolean(due && due.getTime() < now.getTime() && isPendingOrder(order)),
  };
}

// Order documents only carry Customer_uuid — every screen that lists orders
// by task/assignment needs the customer's display name, so resolve it once
// per batch here rather than each caller re-joining Customers itself.
async function buildCustomerNameMap(orders) {
  const uuids = [...new Set((orders || []).map((o) => o?.Customer_uuid).filter(Boolean))];
  if (!uuids.length) return new Map();
  const customers = await Customers.find(
    { Customer_uuid: { $in: uuids } },
    { Customer_uuid: 1, Customer_name: 1 }
  ).lean();
  return new Map(customers.map((c) => [c.Customer_uuid, c.Customer_name]));
}

async function getPendingOrdersForUser(userOrName) {
  const user = typeof userOrName === 'string'
    ? await Users.findOne({ User_name: userOrName })
    : userOrName;

  if (!user) throw new Error('User not found');

  const rows = await Orders.find({
    $or: [
      { assignedTo: user._id },
      { 'Status.Assigned': user.User_name },
    ],
  }).sort({ dueDate: 1, createdAt: 1 }).lean();

  const customerNames = await buildCustomerNameMap(rows);
  const orders = rows
    .map((row) => decorateOrder(row))
    .filter(isDesignAssignmentPending)
    .map((order) => ({ ...order, customerName: customerNames.get(order.Customer_uuid) || '' }));
  return {
    user: {
      id: String(user._id),
      userName: user.User_name,
      role: user.User_group,
      mobile: user.Mobile_number,
    },
    orders,
    overdueCount: orders.filter((order) => order.overdue).length,
    pendingCount: orders.length,
  };
}

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '');
}

// ── Admin-facing "who has what, at which stage" overview ───────────────────

async function getPendingTasksOverview() {
  const now = new Date();
  const rows = await Orders.find({ stage: { $nin: Array.from(CLOSED_STAGES) } })
    .sort({ dueDate: 1, createdAt: 1 })
    .lean();

  const customerNames = await buildCustomerNameMap(rows);
  const tasks = rows.map((row) => {
    const decorated = decorateOrder(row, now);
    const assigned = decorated.latestStatusTask?.Assigned;
    return {
      orderId: String(row._id),
      orderNumber: row.Order_Number,
      customerName: customerNames.get(row.Customer_uuid) || '',
      stage: row.stage,
      task: decorated.latestStatusTask?.Task || row.stage || 'Task',
      assignedTo: assigned && assigned !== 'None' ? assigned : 'Unassigned',
      dueDate: row.dueDate,
      overdue: decorated.overdue,
    };
  });

  const byUserMap = new Map();
  for (const task of tasks) {
    if (!byUserMap.has(task.assignedTo)) {
      byUserMap.set(task.assignedTo, { userName: task.assignedTo, count: 0, overdueCount: 0, tasks: [] });
    }
    const group = byUserMap.get(task.assignedTo);
    group.count += 1;
    if (task.overdue) group.overdueCount += 1;
    group.tasks.push(task);
  }

  return {
    tasks,
    byUser: Array.from(byUserMap.values()).sort((a, b) => b.count - a.count),
    totalCount: tasks.length,
    overdueCount: tasks.filter((task) => task.overdue).length,
    unassignedCount: tasks.filter((task) => task.assignedTo === 'Unassigned').length,
  };
}

async function buildPendingOverviewMessage(overview) {
  if (!overview.totalCount) {
    const { body } = await renderTemplate('task.pending_overview_empty');
    return body;
  }
  const lines = overview.byUser.map(
    (group) => `${group.userName}: ${group.count} task${group.count === 1 ? '' : 's'}${group.overdueCount ? ` (${group.overdueCount} overdue)` : ''}`
  );
  const { body } = await renderTemplate('task.pending_overview', {
    total: overview.totalCount,
    overdue: overview.overdueCount,
    lines: lines.join('\n'),
  });
  return body;
}

// ── WhatsApp side-effects on assignment, both fire-and-forget so they
// never block the assign response ──────────────────────────────────────────

async function notifyUserOfAssignment({ order, user, assignedBy }) {
  const mobile = normalizeMobile(user?.Mobile_number);
  if (!mobile) return;
  const latest = Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
  const dueText = order?.dueDate ? new Date(order.dueDate).toLocaleString('en-IN') : 'today, 8:00 PM';
  const { body } = await renderTemplate('task.assignment_notify', {
    userName: user.User_name || user.name || 'there',
    orderNumber: order.Order_Number,
    taskName: latest?.Task || order.stage || 'Task',
    assignedBy: assignedBy || 'System',
    dueDate: dueText,
  });
  await sendWhatsAppText({ to: mobile, body });
}

async function notifyAdminsOfPendingOverview() {
  const overview = await getPendingTasksOverview();
  const body = await buildPendingOverviewMessage(overview);
  const users = await Users.find({}).lean();
  for (const u of users) {
    if (tierFor(u.User_group) < 4) continue; // Admin/Owner tier only
    const mobile = normalizeMobile(u.Mobile_number);
    if (!mobile) continue;
    try {
      await sendWhatsAppText({ to: mobile, body });
    } catch (err) {
      logger.error(`[orderTask] Failed to notify admin ${mobile} of pending overview:`, err.message);
    }
  }
}

async function getUnassignedOrders() {
  const rows = await Orders.find({
    $and: [
      { $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }] },
      { $or: [{ 'Status.Assigned': 'None' }, { 'Status.Assigned': { $exists: false } }] },
      { stage: { $nin: Array.from(CLOSED_STAGES) } },
    ],
  }).sort({ createdAt: 1 }).lean();

  return rows.map((row) => decorateOrder(row)).filter(isDesignAssignmentPending);
}

// Sentinel used in place of a real user when the ball is in the customer's
// court (e.g. sent for approval) rather than any team member's — the one
// other place a pending task can legitimately sit, per the order flow.
const CUSTOMER_ASSIGNEE_LABEL = 'Customer';

async function assignOrderToUser({ orderId, userId, userName, assignedBy = 'System', via = 'app' }) {
  const filter = mongoose.isValidObjectId(orderId) ? { _id: orderId } : { Order_uuid: orderId };
  const order = await Orders.findOne(filter);
  if (!order) throw new Error('Order not found');

  const isCustomerAssignment = !userId && String(userName || '').trim().toLowerCase() === 'customer';

  let user = null;
  if (!isCustomerAssignment) {
    user = userId
      ? await Users.findById(userId)
      : await Users.findOne({ $or: [{ User_name: String(userName || '').trim() }, { User_uuid: String(userName || '').trim() }] });

    if (!user) throw new Error('Assignee user not found');
  }

  const assigneeLabel = isCustomerAssignment ? CUSTOMER_ASSIGNEE_LABEL : user.User_name;

  order.assignedTo = isCustomerAssignment ? null : user._id;
  order.dueDate = order.dueDate || buildDefaultDueDate();
  if (!order.stage || order.stage === 'enquiry') {
    order.stage = 'design';
  }

  if (!Array.isArray(order.Status) || order.Status.length === 0) {
    order.Status = [{
      Task: 'Design',
      Assigned: assigneeLabel,
      Delivery_Date: order.dueDate,
      Status_number: 1,
      CreatedAt: new Date(),
    }];
  } else {
    const last = order.Status[order.Status.length - 1];
    last.Assigned = assigneeLabel;
    last.Delivery_Date = order.dueDate;
    last.CreatedAt = new Date();
  }

  order.stageHistory = Array.isArray(order.stageHistory) ? order.stageHistory : [];
  order.stageHistory.push({ stage: order.stage, timestamp: new Date() });
  await order.save();

  const plain = order.toObject ? order.toObject() : order;

  // Fire-and-forget: the assignee gets pinged on WhatsApp, and admins get the
  // refreshed full pending-tasks overview, but neither should block the
  // assign response. Nothing to ping when the task is just waiting on the
  // customer, so notifyUserOfAssignment is skipped in that case.
  if (!isCustomerAssignment) {
    notifyUserOfAssignment({ order: plain, user, assignedBy }).catch((err) => {
      logger.error('[orderTask] Failed to notify assignee of assignment:', err.message);
    });
  }
  notifyAdminsOfPendingOverview().catch((err) => {
    logger.error('[orderTask] Failed to notify admins of pending overview:', err.message);
  });

  return {
    ...decorateOrder(plain),
    assignmentMeta: {
      assignedBy,
      via,
      assignedAt: new Date(),
    },
  };
}

async function rolloverPendingOrders() {
  const now = new Date();
  const cutoff = buildDefaultDueDate(now);
  if (now.getTime() < cutoff.getTime()) return { touched: 0 };

  const rows = await Orders.find({
    stage: { $nin: Array.from(CLOSED_STAGES) },
    dueDate: { $lt: now },
  });

  let touched = 0;
  for (const order of rows) {
    order.dueDate = getTomorrowDueDate(now);
    await order.save();
    touched += 1;
  }
  return { touched };
}

async function buildTaskSummaryMessage({ employee, orders = [] }) {
  const name = employee?.User_name || 'team';
  if (!orders.length) {
    const { body } = await renderTemplate('task.summary_none', { name });
    return body;
  }

  const list = orders.slice(0, 8).map((order, index) => {
    const latest = order.latestStatusTask;
    return `${index + 1}. Order #${order.Order_Number} - ${latest?.Task || order.stage || 'Task'}${order.overdue ? ' (overdue)' : ''}`;
  }).join('\n');

  const { body } = await renderTemplate('task.summary_intro', { name, list });
  return body;
}

module.exports = {
  buildDefaultDueDate,
  getTomorrowDueDate,
  getPendingOrdersForUser,
  getUnassignedOrders,
  getPendingTasksOverview,
  assignOrderToUser,
  rolloverPendingOrders,
  buildTaskSummaryMessage,
  buildPendingOverviewMessage,
};
