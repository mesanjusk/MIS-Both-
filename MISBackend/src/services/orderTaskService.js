const mongoose = require('mongoose');
const Orders = require('../repositories/order');
const Users = require('../repositories/users');
const Customers = require('../repositories/customer');
const { sendWhatsAppText } = require('./unifiedWhatsAppService');
const { tierFor } = require('../utils/roleHierarchy');
const { renderTemplate } = require('./whatsappTemplateService');
const logger = require('../utils/logger');
const { CLOSED_STAGES, isValidStage, normalizeLegacyStage } = require('../constants/orderStages');
const normalizeWhatsAppNumber = require('../utils/normalizeNumber');

const DESIGN_STAGE_KEYS = new Set([
  'enquiry',
  'approved',
  'new_design',
  'old_design',
  'approval',
  'hold',
  'customer',
  'ready_to_print',
]);

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

// The Status[].Task free-text log (pushed by drag-drop / the dashboard move
// actions) is tracked separately from the canonical `stage` enum, so an
// order can read "Delivered" there while `stage` never caught up. Every
// pending/unassigned view needs to treat that as closed too, or a delivered
// order sits on the home screen forever just because `stage` is stale.
const CLOSED_TASK_LABELS = new Set(['delivered', 'cancel', 'cancelled']);

function getLatestStatusTask(order) {
  return Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
}

// "DragDrop" is a legacy placeholder the old kanban drag-drop endpoint used
// to write into Status.Assigned when it had no real assignee to carry
// forward (see statusRouter's /updateStatus) — older rows still have it on
// disk. Treated the same as the "None" sentinel so it never renders as if
// a person named DragDrop owns the task.
const UNASSIGNED_ASSIGNED_VALUES = new Set(['none', 'dragdrop', '']);

function normalizeAssignedLabel(assigned) {
  const trimmed = String(assigned || '').trim();
  return UNASSIGNED_ASSIGNED_VALUES.has(trimmed.toLowerCase()) ? 'Unassigned' : trimmed;
}

function isLatestTaskClosed(order) {
  const task = getLatestStatusTask(order)?.Task;
  return CLOSED_TASK_LABELS.has(String(task || '').trim().toLowerCase());
}

function isPendingOrder(order) {
  return !CLOSED_STAGES.has(String(order?.stage || '').toLowerCase()) && !isLatestTaskClosed(order);
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
  if (!String(value || '').trim()) return '';
  // Same country-code-aware normalization used by every other WhatsApp send
  // path (attendance, usertask) — a bare digit-strip here left the assignee
  // notification silently undeliverable for 10-digit stored numbers.
  return normalizeWhatsAppNumber(value);
}

// order.dueDate is a single Date field — the assignment card shows it as two
// lines ("Due Date" / "Due Time"), so split it here rather than storing both.
function formatDueDateParts(dueDate) {
  if (!dueDate) return { dueDateText: 'Today', dueTimeText: '8:00 PM' };
  const d = new Date(dueDate);
  const dueDateText = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const dueTimeText = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  return { dueDateText, dueTimeText };
}

// ── Admin-facing "who has what, at which stage" overview ───────────────────

async function getPendingTasksOverview() {
  const now = new Date();
  const rows = (await Orders.find({ stage: { $nin: Array.from(CLOSED_STAGES) } })
    .sort({ dueDate: 1, createdAt: 1 })
    .lean()).filter((row) => !isLatestTaskClosed(row));

  const customerNames = await buildCustomerNameMap(rows);
  const tasks = rows.map((row) => {
    const decorated = decorateOrder(row, now);
    return {
      orderId: String(row._id),
      orderNumber: row.Order_Number,
      customerName: customerNames.get(row.Customer_uuid) || '',
      description: row.orderNote || '',
      stage: row.stage,
      task: decorated.latestStatusTask?.Task || row.stage || 'Task',
      assignedTo: normalizeAssignedLabel(decorated.latestStatusTask?.Assigned),
      assignedToType: decorated.latestStatusTask?.AssignedType || 'user',
      assignedBy: decorated.latestStatusTask?.AssignedBy || '',
      dueDate: row.dueDate,
      overdue: decorated.overdue,
      stageUpdatedAt: decorated.latestStatusTask?.CreatedAt || row.updatedAt || null,
    };
  });

  const byUserMap = new Map();
  for (const task of tasks) {
    if (!byUserMap.has(task.assignedTo)) {
      byUserMap.set(task.assignedTo, {
        userName: task.assignedTo,
        assignedToType: task.assignedTo === 'Unassigned' ? '' : task.assignedToType,
        count: 0,
        overdueCount: 0,
        tasks: [],
      });
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

async function getCustomerName(customerUuid) {
  if (!customerUuid) return '';
  const customer = await Customers.findOne({ Customer_uuid: customerUuid }, { Customer_name: 1 }).lean();
  return customer?.Customer_name || '';
}

async function notifyUserOfAssignment({ order, user, assignedBy, customerNameOverride }) {
  const mobile = normalizeMobile(user?.Mobile_number);
  if (!mobile) return;
  const customerName = customerNameOverride ?? await getCustomerName(order?.Customer_uuid);
  const { dueDateText, dueTimeText } = formatDueDateParts(order?.dueDate);
  const { body } = await renderTemplate('task.assignment_notify', {
    userName: user.User_name || user.name || 'there',
    orderNumber: order?.Order_Number || '—',
    customerName: customerName || '—',
    assignedBy: assignedBy || 'System',
    dueDate: dueDateText,
    dueTime: dueTimeText,
  });
  await sendWhatsAppText({ to: mobile, body });
}

async function notifyAdminsOfAssignment({ order, user, assignedBy, customerNameOverride }) {
  const customerName = customerNameOverride ?? await getCustomerName(order?.Customer_uuid);
  const { dueDateText, dueTimeText } = formatDueDateParts(order?.dueDate);
  const { body } = await renderTemplate('task.admin_assignment_notify', {
    userName: user?.User_name || CUSTOMER_ASSIGNEE_LABEL,
    orderNumber: order?.Order_Number || '—',
    customerName: customerName || '—',
    assignedBy: assignedBy || 'System',
    dueDate: dueDateText,
    dueTime: dueTimeText,
  });
  const admins = await Users.find({}).lean();
  for (const u of admins) {
    if (tierFor(u.User_group) < 4) continue; // Admin/Owner tier only
    const mobile = normalizeMobile(u.Mobile_number);
    if (!mobile) continue;
    try {
      await sendWhatsAppText({ to: mobile, body });
    } catch (err) {
      logger.error(`[orderTask] Failed to notify admin ${mobile} of order assignment:`, err.message);
    }
  }
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

async function assignOrderToUser({ orderId, userId, userName, vendorId, assignedBy = 'System', via = 'app' }) {
  const filter = mongoose.isValidObjectId(orderId) ? { _id: orderId } : { Order_uuid: orderId };
  const order = await Orders.findOne(filter);
  if (!order) throw new Error('Order not found');

  const isVendorAssignment = Boolean(vendorId);
  const isCustomerAssignment = !isVendorAssignment && !userId && String(userName || '').trim().toLowerCase() === 'customer';

  let user = null;
  // "vendor" here means an Account Payable party (Customers, not
  // VendorMaster) — see MISBackend/src/routes/Assignees.js for why that
  // collection is the real, admin-curated "who we owe money to" list.
  let vendor = null;
  if (isVendorAssignment) {
    vendor = await Customers.findOne({ $or: [{ Customer_uuid: String(vendorId) }, ...(mongoose.isValidObjectId(vendorId) ? [{ _id: vendorId }] : [])] });
    if (!vendor) throw new Error('Assignee vendor not found');
  } else if (!isCustomerAssignment) {
    user = userId
      ? await Users.findById(userId)
      : await Users.findOne({ $or: [{ User_name: String(userName || '').trim() }, { User_uuid: String(userName || '').trim() }] });

    if (!user) throw new Error('Assignee user not found');
  }

  const assigneeLabel = isVendorAssignment ? vendor.Customer_name : isCustomerAssignment ? CUSTOMER_ASSIGNEE_LABEL : user.User_name;
  const assignedToType = isVendorAssignment ? 'vendor' : 'user';

  order.assignedTo = isVendorAssignment ? vendor._id : isCustomerAssignment ? null : user._id;
  order.assignedToType = assignedToType;
  order.dueDate = order.dueDate || buildDefaultDueDate();
  if (!order.stage || order.stage === 'enquiry') {
    order.stage = 'new_design';
  } else if (!isValidStage(order.stage)) {
    // Older orders can still carry a pre-migration stage value (e.g. the
    // coarse 'design'/'printing' stages) that isn't in the current enum —
    // order.save() below validates the whole document, so this would
    // otherwise fail on a field nothing here even touched. Normalize it the
    // moment the order is assigned instead of requiring a separate bulk
    // migration first.
    order.stage = normalizeLegacyStage(order.stage);
    if (!isValidStage(order.stage)) order.stage = 'new_design';
  }

  if (!Array.isArray(order.Status) || order.Status.length === 0) {
    order.Status = [{
      Task: 'Design',
      Assigned: assigneeLabel,
      AssignedType: assignedToType,
      AssignedBy: assignedBy,
      Delivery_Date: order.dueDate,
      Status_number: 1,
      CreatedAt: new Date(),
    }];
  } else {
    const last = order.Status[order.Status.length - 1];
    last.Assigned = assigneeLabel;
    last.AssignedType = assignedToType;
    last.AssignedBy = assignedBy;
    last.Delivery_Date = order.dueDate;
    last.CreatedAt = new Date();
  }

  order.stageHistory = Array.isArray(order.stageHistory) ? order.stageHistory : [];
  // Same legacy-value problem can live in older history entries — the whole
  // array is validated on save, so a stale entry here would fail the save
  // just as much as a stale top-level order.stage would.
  order.stageHistory.forEach((entry) => {
    if (entry?.stage && !isValidStage(entry.stage)) {
      entry.stage = isValidStage(normalizeLegacyStage(entry.stage)) ? normalizeLegacyStage(entry.stage) : 'new_design';
    }
  });
  order.stageHistory.push({ stage: order.stage, timestamp: new Date() });
  await order.save();

  const plain = order.toObject ? order.toObject() : order;

  // Fire-and-forget: the assignee gets pinged on WhatsApp with the new-order
  // card, admins get the same card plus the refreshed full pending-tasks
  // overview, but none of these should block the assign response. Nothing to
  // ping when the task is just waiting on the customer, so notifyUserOfAssignment
  // is skipped in that case. Vendor/freelancer assignments don't get the
  // employee-style WhatsApp card either — those parties are notified through
  // the existing vendor job flow, not the in-house task-assignment template.
  if (!isCustomerAssignment && !isVendorAssignment) {
    notifyUserOfAssignment({ order: plain, user, assignedBy }).catch((err) => {
      logger.error('[orderTask] Failed to notify assignee of assignment:', err.message);
    });
  }
  // Admin notify needs a User_name-shaped object regardless of assignee type
  // — a vendor has no Users row, so build a synthetic one from the label
  // already resolved above rather than falling through to the "Customer"
  // default baked into notifyAdminsOfAssignment.
  notifyAdminsOfAssignment({ order: plain, user: user || { User_name: assigneeLabel }, assignedBy }).catch((err) => {
    logger.error('[orderTask] Failed to notify admins of order assignment:', err.message);
  });
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
  notifyUserOfAssignment,
  notifyAdminsOfAssignment,
};
