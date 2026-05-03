const Orders = require('../repositories/order');
const Transaction = require('../repositories/transaction');
const Attendance = require('../repositories/attendance');
const Users = require('../repositories/users');
const Usertasks = require('../repositories/usertask');
const Customers = require('../repositories/customer');
const { getPendingOrdersForUser } = require('../services/orderTaskService');
const logger = require('../utils/logger');

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const toLower = (value = '') => String(value || '').trim().toLowerCase();

const normalizeDateValue = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const normalizeTaskStatus = (task) =>
  toLower(task?.TaskStatus || task?.Status || task?.status || task?.Task_Status || 'pending');

const isPendingUsertask = (task) => !['completed', 'done'].includes(normalizeTaskStatus(task));

const getLatestStatusTask = (order) =>
  Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;

const isEnquiryLike = (order) => {
  const currentTask = String(getLatestStatusTask(order)?.Task || order?.stage || '').trim().toLowerCase();
  return ['enquiry', 'enquiries', 'inquiry', 'lead'].includes(currentTask);
};

const matchUsertaskToUser = (task, user) => {
  const taskUser = String(task?.User || task?.AssignedTo || task?.Assigned || '').trim();
  const userName = String(user?.User_name || '').trim();
  const mobile = String(user?.Mobile_number || '').replace(/\D/g, '');

  if (!taskUser) return false;
  if (taskUser === userName) return true;
  if (taskUser.replace(/\D/g, '') && taskUser.replace(/\D/g, '') === mobile) return true;
  return false;
};

const buildOrderTaskRow = (order, userName = '') => {
  const latestStatusTask = getLatestStatusTask(order);
  const dueDate = order?.dueDate || latestStatusTask?.Delivery_Date || null;
  const normalizedDueDate = normalizeDateValue(dueDate);
  return {
    id: String(order?._id || order?.Order_uuid || order?.Order_Number || ''),
    source: 'order',
    title: `Order #${order?.Order_Number || '-'}`,
    subtitle: order?.Customer_name || order?.customerName || '',
    taskName: latestStatusTask?.Task || order?.stage || 'Design',
    assignedTo:
      order?.assignedToName ||
      latestStatusTask?.Assigned ||
      userName ||
      '',
    status: latestStatusTask?.Task || order?.stage || 'pending',
    dueDate: normalizedDueDate,
    overdue: Boolean(normalizedDueDate && normalizedDueDate.getTime() < Date.now()),
    orderNumber: order?.Order_Number || null,
    remark: order?.Remark || order?.orderNote || '',
    raw: order,
  };
};

const buildUsertaskRow = (task, resolvedUserName = '') => ({
  id: String(task?._id || task?.Usertask_uuid || task?.Usertask_Number || ''),
  source: 'usertask',
  title: task?.Usertask_name || 'Untitled Task',
  subtitle: task?.Remark || '',
  taskName: task?.Usertask_name || 'Task',
  assignedTo: resolvedUserName || String(task?.User || task?.AssignedTo || task?.Assigned || '').trim(),
  status: task?.Status || task?.TaskStatus || 'Pending',
  dueDate: normalizeDateValue(task?.Deadline),
  overdue: Boolean(normalizeDateValue(task?.Deadline) && normalizeDateValue(task?.Deadline).getTime() < Date.now()),
  orderNumber: null,
  remark: task?.Remark || '',
  raw: task,
});

const buildUserWiseAssignedTasks = ({ users = [], orderRowsByUser = new Map(), usertaskRows = [] }) => {
  const bucket = new Map();

  users.forEach((user) => {
    const userName = String(user?.User_name || '').trim();
    if (!userName) return;
    bucket.set(userName, {
      user: userName,
      group: user?.User_group || '',
      orderTasks: 0,
      userTasks: 0,
      total: 0,
      pending: 0,
      inProgress: 0,
    });
  });

  for (const [userName, rows] of orderRowsByUser.entries()) {
    if (!bucket.has(userName)) {
      bucket.set(userName, {
        user: userName,
        group: '',
        orderTasks: 0,
        userTasks: 0,
        total: 0,
        pending: 0,
        inProgress: 0,
      });
    }
    const row = bucket.get(userName);
    row.orderTasks += rows.length;
    row.total += rows.length;
    row.pending += rows.length;
  }

  usertaskRows.forEach((task) => {
    const assigned = String(task?.resolvedUserName || task?.User || task?.AssignedTo || task?.Assigned || '').trim() || 'Unassigned';
    if (!bucket.has(assigned)) {
      bucket.set(assigned, {
        user: assigned,
        group: '',
        orderTasks: 0,
        userTasks: 0,
        total: 0,
        pending: 0,
        inProgress: 0,
      });
    }
    const row = bucket.get(assigned);
    row.userTasks += 1;
    row.total += 1;

    const status = normalizeTaskStatus(task);
    if (['in_progress', 'progress', 'ongoing', 'working'].includes(status)) row.inProgress += 1;
    else row.pending += 1;
  });

  return Array.from(bucket.values()).sort((a, b) => b.total - a.total || a.user.localeCompare(b.user));
};

const getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    const from = startOfDay(now);
    const to = endOfDay(now);

    const requestedUserName = String(req.query?.userName || '').trim();
    const isAdmin =
      String(req.query?.isAdmin || '').trim().toLowerCase() === 'true' ||
      String(req.query?.role || '').trim().toLowerCase() === 'admin';

    const [orderAgg, revenueAgg, pendingPaymentAgg, attendanceAgg, urgentOrders, users, allUsertasks, todayDeliveredOrders, allOrders] =
      await Promise.all([
        Orders.aggregate([
          {
            $facet: {
              todayOrders: [{ $match: { createdAt: { $gte: from, $lte: to } } }, { $count: 'count' }],
              pendingOrders: [{ $match: { stage: { $nin: ['delivered', 'paid'] } } }, { $count: 'count' }],
            },
          },
        ]),
        Transaction.aggregate([
          { $match: { Transaction_date: { $gte: from, $lte: to } } },
          { $group: { _id: null, revenue: { $sum: { $ifNull: ['$Total_Debit', 0] } } } },
        ]),
        Orders.aggregate([
          { $match: { billStatus: { $ne: 'paid' } } },
          { $group: { _id: null, pendingPayments: { $sum: { $ifNull: ['$Amount', 0] } } } },
        ]),
        Attendance.aggregate([
          { $match: { Date: { $gte: from, $lte: to } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ]),
        Orders.find({
          dueDate: { $lt: now, $ne: null },
          stage: { $nin: ['delivered', 'paid'] },
        })
          .sort({ dueDate: 1 })
          .limit(100)
          .lean(),
        Users.find({}).lean(),
        Usertasks.find({}).lean(),
        Orders.find({
          updatedAt: { $gte: from, $lte: to },
          Status: { $elemMatch: { Task: 'Delivered' } },
        }).lean(),
        Orders.find({}).lean(),
      ]);

    const todayOrdersCount = orderAgg?.[0]?.todayOrders?.[0]?.count || 0;
    const pendingOrdersCount = orderAgg?.[0]?.pendingOrders?.[0]?.count || 0;
    const todayRevenue = revenueAgg?.[0]?.revenue || 0;
    const pendingPayments = pendingPaymentAgg?.[0]?.pendingPayments || 0;
    const todayAttendance = attendanceAgg?.[0]?.count || 0;
    const todayDelivery = Array.isArray(todayDeliveredOrders) ? todayDeliveredOrders.length : 0;

    const todayEnquiry = (allOrders || []).filter((order) => {
      const createdAt = normalizeDateValue(order?.createdAt);
      if (!createdAt || createdAt < from || createdAt > to) return false;
      return isEnquiryLike(order);
    }).length;

    const orderRowsByUser = new Map();
    for (const user of users) {
      const userName = String(user?.User_name || '').trim();
      if (!userName) continue;
      try {
        const assigned = await getPendingOrdersForUser(userName);
        const rows = Array.isArray(assigned?.orders)
          ? assigned.orders.map((order) => buildOrderTaskRow(order, userName))
          : [];
        orderRowsByUser.set(userName, rows);
      } catch {
        orderRowsByUser.set(userName, []);
      }
    }

    const pendingUsertasks = (allUsertasks || []).filter(isPendingUsertask);
    const usertaskRows = pendingUsertasks.map((task) => {
      const matchedUser = users.find((user) => matchUsertaskToUser(task, user));
      return {
        ...task,
        resolvedUserName: matchedUser?.User_name || String(task?.User || task?.AssignedTo || task?.Assigned || '').trim(),
      };
    });

    let myAssignedTasks = [];
    if (requestedUserName) {
      const myOrderRows = orderRowsByUser.get(requestedUserName) || [];
      const myUsertaskRows = usertaskRows
        .filter((task) => String(task?.resolvedUserName || '').trim() === requestedUserName)
        .map((task) => buildUsertaskRow(task, requestedUserName));

      myAssignedTasks = [...myOrderRows, ...myUsertaskRows].sort((a, b) => {
        const dateA = normalizeDateValue(a?.dueDate)?.getTime() || 0;
        const dateB = normalizeDateValue(b?.dueDate)?.getTime() || 0;
        return dateA - dateB;
      });
    }

    const allAssignedTasksForAdmin = [];
    if (isAdmin) {
      for (const rows of orderRowsByUser.values()) {
        allAssignedTasksForAdmin.push(...rows);
      }
      allAssignedTasksForAdmin.push(
        ...usertaskRows.map((task) => buildUsertaskRow(task, task?.resolvedUserName || ''))
      );
      allAssignedTasksForAdmin.sort((a, b) => {
        const dateA = normalizeDateValue(a?.dueDate)?.getTime() || 0;
        const dateB = normalizeDateValue(b?.dueDate)?.getTime() || 0;
        return dateA - dateB;
      });
    }

    const userWiseAssignedTasks = buildUserWiseAssignedTasks({
      users,
      orderRowsByUser,
      usertaskRows,
    });

    return res.status(200).json({
      success: true,
      result: {
        todayOrdersCount,
        pendingOrdersCount,
        urgentOrders,
        todayRevenue,
        pendingPayments,
        todayAttendance,
        todayDelivery,
        todayEnquiry,

        // aliases for current frontend
        todayOrders: todayOrdersCount,
        pendingOrders: pendingOrdersCount,
        paymentReceivableToday: pendingPayments,
        todayRevenueAmount: todayRevenue,

        assignedTasks: isAdmin ? allAssignedTasksForAdmin : myAssignedTasks,
        myAssignedTasks,
        userWiseAssignedTasks,
      },
    });
  } catch (error) {
    logger.error('Dashboard summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard summary' });
  }
};


const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getOrderCustomerName = async (customerUuid) => {
  if (!customerUuid) return '';
  const customer = await Customers.findOne({ Customer_uuid: customerUuid }, { Customer_name: 1, Mobile_number: 1 }).lean();
  return customer?.Customer_name || '';
};

const getOutstandingSummary = async (_req, res) => {
  try {
    const unpaidOrders = await Orders.find({ billStatus: 'unpaid' }).lean();
    const customerIds = [...new Set(unpaidOrders.map((order) => order.Customer_uuid).filter(Boolean))];
    const customers = await Customers.find({ Customer_uuid: { $in: customerIds } }, { Customer_uuid: 1, Customer_name: 1 }).lean();
    const customerMap = new Map(customers.map((customer) => [customer.Customer_uuid, customer.Customer_name]));

    const grouped = new Map();
    let totalOutstandingAmount = 0;

    unpaidOrders.forEach((order) => {
      const amount = asNumber(order.Amount || order.saleSubtotal, 0);
      totalOutstandingAmount += amount;
      const key = order.Customer_uuid || 'unknown';
      const current = grouped.get(key) || {
        customerUuid: order.Customer_uuid || '',
        customerName: customerMap.get(order.Customer_uuid) || order.customerName || 'Unknown Customer',
        totalDue: 0,
        oldestOrderDate: order.createdAt || order.updatedAt || null,
      };
      current.totalDue += amount;
      const orderDate = normalizeDateValue(order.createdAt || order.updatedAt);
      const oldest = normalizeDateValue(current.oldestOrderDate);
      if (orderDate && (!oldest || orderDate < oldest)) current.oldestOrderDate = orderDate;
      grouped.set(key, current);
    });

    const customerWiseBreakdown = Array.from(grouped.values()).sort((a, b) => b.totalDue - a.totalDue);

    return res.json({
      success: true,
      totalOutstandingAmount,
      totalUnpaidOrders: unpaidOrders.length,
      customerWiseBreakdown,
    });
  } catch (error) {
    logger.error('Outstanding summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch outstanding summary' });
  }
};

const getStuckOrders = async (_req, res) => {
  try {
    const now = new Date();
    const readyCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const [readyOrders, deliveredUnpaidOrders] = await Promise.all([
      Orders.find({ stage: 'ready', updatedAt: { $lt: readyCutoff } }).sort({ updatedAt: 1 }).lean(),
      Orders.find({ stage: 'delivered', billStatus: 'unpaid' }).sort({ updatedAt: 1 }).lean(),
    ]);
    const customerIds = [...new Set([...readyOrders, ...deliveredUnpaidOrders].map((order) => order.Customer_uuid).filter(Boolean))];
    const customers = await Customers.find({ Customer_uuid: { $in: customerIds } }, { Customer_uuid: 1, Customer_name: 1 }).lean();
    const customerMap = new Map(customers.map((customer) => [customer.Customer_uuid, customer.Customer_name]));

    const readyNotDelivered = readyOrders.map((order) => ({
      Order_Number: order.Order_Number,
      Order_uuid: order.Order_uuid,
      customerName: customerMap.get(order.Customer_uuid) || order.customerName || 'Unknown Customer',
      dueDate: order.dueDate || null,
      hoursStuck: Math.max(0, Math.round((now - new Date(order.updatedAt || now)) / 36_000) / 10),
    }));

    const deliveredNotPaid = deliveredUnpaidOrders.map((order) => ({
      Order_Number: order.Order_Number,
      Order_uuid: order.Order_uuid,
      customerName: customerMap.get(order.Customer_uuid) || order.customerName || 'Unknown Customer',
      Amount: asNumber(order.Amount || order.saleSubtotal, 0),
      daysSinceDelivery: Math.max(0, Math.floor((now - new Date(order.updatedAt || now)) / 86_400_000)),
    }));

    return res.json({ success: true, readyNotDelivered, deliveredNotPaid });
  } catch (error) {
    logger.error('Stuck orders error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch stuck orders' });
  }
};

const getDailyCashPosition = async (_req, res) => {
  try {
    const now = new Date();
    const from = startOfDay(now);
    const to = endOfDay(now);
    const transactions = await Transaction.find({ Transaction_date: { $gte: from, $lte: to } }).lean();

    const grouped = new Map();
    let cashIn = 0;
    let cashOut = 0;
    let upiIn = 0;
    let bankIn = 0;

    transactions.forEach((txn) => {
      const mode = String(txn.Payment_mode || 'Other');
      const moneyIn = asNumber(txn.Total_Debit, 0);
      const moneyOut = asNumber(txn.Total_Credit, 0);
      const current = grouped.get(mode) || { mode, in: 0, out: 0 };
      current.in += moneyIn;
      current.out += moneyOut;
      grouped.set(mode, current);

      const modeLower = mode.toLowerCase();
      if (modeLower.includes('cash')) {
        cashIn += moneyIn;
        cashOut += moneyOut;
      }
      if (modeLower.includes('upi')) upiIn += moneyIn;
      if (modeLower.includes('bank')) bankIn += moneyIn;
    });

    return res.json({
      success: true,
      cashIn,
      cashOut,
      netCash: cashIn - cashOut,
      upiIn,
      bankIn,
      breakdown: Array.from(grouped.values()),
    });
  } catch (error) {
    logger.error('Daily cash position error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch daily cash position' });
  }
};

const getCustomerAging = async (req, res) => {
  try {
    const filter = { billStatus: 'unpaid' };
    const fromDate = normalizeDateValue(req.query?.fromDate);
    const toDate = normalizeDateValue(req.query?.toDate);
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = startOfDay(fromDate);
      if (toDate) filter.createdAt.$lte = endOfDay(toDate);
    }

    const orders = await Orders.find(filter).lean();
    const customerIds = [...new Set(orders.map((order) => order.Customer_uuid).filter(Boolean))];
    const customers = await Customers.find({ Customer_uuid: { $in: customerIds } }, { Customer_uuid: 1, Customer_name: 1, Mobile_number: 1 }).lean();
    const customerMap = new Map(customers.map((customer) => [customer.Customer_uuid, customer]));
    const now = new Date();
    const rows = new Map();

    orders.forEach((order) => {
      const customer = customerMap.get(order.Customer_uuid) || {};
      const key = order.Customer_uuid || 'unknown';
      const createdAt = normalizeDateValue(order.createdAt || order.updatedAt) || now;
      const days = Math.max(0, Math.floor((startOfDay(now) - startOfDay(createdAt)) / 86_400_000));
      const amount = asNumber(order.Amount || order.saleSubtotal, 0);
      const row = rows.get(key) || {
        customerUuid: order.Customer_uuid || '',
        customerName: customer.Customer_name || order.customerName || 'Unknown Customer',
        mobile: customer.Mobile_number || '',
        total0to30: 0,
        total31to60: 0,
        total61to90: 0,
        total90plus: 0,
        grandTotal: 0,
        oldestOrderDays: 0,
      };

      if (days <= 30) row.total0to30 += amount;
      else if (days <= 60) row.total31to60 += amount;
      else if (days <= 90) row.total61to90 += amount;
      else row.total90plus += amount;

      row.grandTotal += amount;
      row.oldestOrderDays = Math.max(row.oldestOrderDays, days);
      rows.set(key, row);
    });

    return res.json({ success: true, result: Array.from(rows.values()).sort((a, b) => b.grandTotal - a.grandTotal) });
  } catch (error) {
    logger.error('Customer aging error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer aging report' });
  }
};

const entryAccount = (entry = {}) => String(entry.Account_id || entry.Account || '').trim().toLowerCase();
const entryType = (entry = {}) => String(entry.Type || '').trim().toLowerCase();

const isCashAccount = (entry = {}) => entryAccount(entry).includes('cash');

const getCashBookSummary = async (_req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const txns = await Transaction.find({}).sort({ Transaction_date: 1, createdAt: 1 }).lean();

    let historicalDebit = 0;
    let historicalCredit = 0;
    let beforeTodayDebit = 0;
    let beforeTodayCredit = 0;
    let todayReceipts = 0;
    let todayPayments = 0;
    let lastTransactionTime = null;

    txns.forEach((txn) => {
      const txnDate = normalizeDateValue(txn.Transaction_date || txn.createdAt);
      (txn.Journal_entry || []).forEach((entry) => {
        if (!isCashAccount(entry)) return;
        const amount = asNumber(entry.Amount, 0);
        const debit = entryType(entry) === 'debit';
        const credit = entryType(entry) === 'credit';
        if (debit) historicalDebit += amount;
        if (credit) historicalCredit += amount;
        if (txnDate && txnDate < todayStart) {
          if (debit) beforeTodayDebit += amount;
          if (credit) beforeTodayCredit += amount;
        }
        if (txnDate && txnDate >= todayStart && txnDate <= todayEnd) {
          if (debit) todayReceipts += amount;
          if (credit) todayPayments += amount;
          if (!lastTransactionTime || txnDate > lastTransactionTime) lastTransactionTime = txnDate;
        }
      });
    });

    const openingBalance = beforeTodayDebit - beforeTodayCredit;
    const closingBalance = historicalDebit - historicalCredit;

    return res.json({
      success: true,
      openingBalance,
      todayReceipts,
      todayPayments,
      closingBalance,
      lastTransactionTime,
    });
  } catch (error) {
    logger.error('Cash book summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch cash book summary' });
  }
};

module.exports = {
  getDashboardSummary,
  getOutstandingSummary,
  getStuckOrders,
  getDailyCashPosition,
  getCustomerAging,
  getCashBookSummary,
};