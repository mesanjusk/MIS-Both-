const { v4: uuid } = require('uuid');
const Orders = require('../repositories/order');
const Tasks = require('../repositories/tasks');
const Customers = require('../repositories/customer');
const PaymentFollowup = require('../repositories/paymentFollowup');
const Users = require('../repositories/users');
const Usertasks = require('../repositories/usertask');
const Counter = require('../repositories/counter');
const { sendWhatsAppText } = require('./unifiedWhatsAppService');
const { renderTemplate } = require('./whatsappTemplateService');
const logger = require('../utils/logger');
const { ORDER_STAGES, isValidStage, isForwardMove, normalizeLegacyStage } = require('../constants/orderStages');
const { normalizePhone } = require('../utils/phone');
const { resolveOrderFilter } = require('../utils/orderFilter');

const nextUsertaskNumber = async () => {
  const doc = await Counter.findByIdAndUpdate(
    'usertask_number',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(doc?.seq || 1);
};

const normalizeStage = (stage) => String(stage || '').trim().toLowerCase();


const autoCreateDesignerTask = async (order) => {
  try {
    if (!order) return null;
    const orderUuid = order.Order_uuid || String(order._id || '');
    const orderNumber = order.Order_Number || order.orderNumber || '';
    const customerName = order.Customer_name || order.customerName || '';
    const taskName = `Design work for Order #${orderNumber} — ${customerName}`.trim();

    const duplicate = await Usertasks.findOne({
      Usertask_name: taskName,
      Status: { $in: ['Pending', 'pending'] },
    }).lean();
    if (duplicate) return duplicate;

    const designers = await Users.find({
      $or: [
        { Role: 'Designer' },
        { role: 'Designer' },
        { User_type: 'Designer' },
        { User_group: /designer/i },
      ],
    }).sort({ createdAt: 1 }).lean();

    if (!designers.length) return null;

    const designer = designers[0];
    const nextNumber = await nextUsertaskNumber();
    const deadline = order.dueDate || order.Delivery_Date || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const now = new Date();

    return await Usertasks.create({
      Usertask_uuid: uuid(),
      Usertask_Number: nextNumber,
      User: designer.User_name,
      Usertask_name: taskName,
      Date: now,
      Time: now.toLocaleTimeString('en-US', { hour12: false }),
      Deadline: deadline,
      Remark: `Auto-assigned from order lifecycle. Order UUID: ${orderUuid}`,
      Status: 'Pending',
    });
  } catch (err) {
    logger.error('Failed to auto-create designer task:', err.message);
    return null;
  }
};

const autoCreatePostDesignTask = async (order) => {
  try {
    if (!order) return null;
    const orderUuid = order.Order_uuid || String(order._id || '');
    const orderNumber = order.Order_Number || order.orderNumber || '';
    const customerName = order.Customer_name || order.customerName || '';
    const taskName = `Post-print coordination for Order #${orderNumber} — ${customerName}`.trim();

    const duplicate = await Usertasks.findOne({
      Usertask_name: taskName,
      Status: { $in: ['Pending', 'pending'] },
    }).lean();
    if (duplicate) return duplicate;

    const coordinators = await Users.find({
      $or: [
        { User_group: /post.?design/i },
        { User_group: /post.?print/i },
        { Role: /post.?design/i },
        { User_type: /post.?design/i },
      ],
    }).sort({ createdAt: 1 }).lean();

    if (!coordinators.length) return null;

    const coordinator = coordinators[0];
    const nextNumber = await nextUsertaskNumber();
    const deadline = order.dueDate || order.Delivery_Date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const now = new Date();

    return await Usertasks.create({
      Usertask_uuid: uuid(),
      Usertask_Number: nextNumber,
      User: coordinator.User_name,
      Usertask_name: taskName,
      Date: now,
      Time: now.toLocaleTimeString('en-US', { hour12: false }),
      Deadline: deadline,
      Remark: `Auto-assigned from order lifecycle. Order UUID: ${orderUuid}`,
      Status: 'Pending',
    });
  } catch (err) {
    logger.error('Failed to auto-create post-design task:', err.message);
    return null;
  }
};

const notifyDeliveredOrder = async (order) => {
  let customer = null;
  let customerName = order.customerName || 'Customer';
  try {
    customer = await Customers.findOne({ Customer_uuid: order.Customer_uuid }).lean();
    const mobile = normalizePhone(customer?.Mobile_number);
    customerName = customer?.Customer_name || order.customerName || 'Customer';

    if (mobile) {
      const amount = Number(order.Amount || order.saleSubtotal || order.Total_Amount || 0);
      const businessName = process.env.BUSINESS_NAME || process.env.APP_NAME || 'MIS System';
      const { body } = await renderTemplate('lifecycle.delivered_notify', {
        customerName,
        orderNumber: order.Order_Number,
        amount,
        businessName,
      });
      await sendWhatsAppText({ to: mobile, body, source: 'ORDER_DELIVERED', contactName: customerName, activity: 'ORDER_UPDATES' });
      logger.info(`WhatsApp notification sent for delivered order #${order.Order_Number}`);
    }
  } catch (error) {
    logger.error(`WhatsApp failed: ${error.message}`);
  }

  try {
    const orderTotal = Number(order.Total_Amount || order.totalAmount || order.Amount || order.saleSubtotal || 0);
    const paidAmount = Number(order.paidAmount || order.Paid_Amount || 0);
    const pendingAmount = orderTotal - paidAmount;
    if (pendingAmount > 0) {
      const title = `Order #${order.Order_Number} payment reminder`;
      const exists = await PaymentFollowup.findOne({
        customer_name: customerName,
        amount: pendingAmount,
        title,
        status: 'pending',
      }).lean();
      if (!exists) {
        await PaymentFollowup.create({
          followup_uuid: uuid(),
          customer_name: customerName,
          amount: pendingAmount,
          title,
          remark: `Auto-created on delivery of Order #${order.Order_Number}`,
          followup_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          status: 'pending',
          created_by: 'system',
        });
      }
    }
  } catch (followupErr) {
    logger.error('Failed to create payment followup:', followupErr.message);
  }
};

const assertValidStage = (stage) => {
  if (!isValidStage(stage)) {
    const error = new Error(`Invalid stage. Allowed stages: ${ORDER_STAGES.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
};

// The one writer for order.stage. Every other service (businessWorkflowService,
// workflowTemplateService's step-driven auto-advance, WhatsApp commands) should
// route stage changes through this function rather than mutating stage/
// stageHistory directly, so the rollback rule and side effects apply uniformly.
//
// `statusEntry`, if passed, is appended to the free-text Status[] log in the
// same atomic update as the stage change (Status_number computed from the
// array's current size server-side, avoiding a stale-read race).
const updateOrderStage = async ({ orderId, stage, statusEntry = null }) => {
  const normalizedStage = normalizeStage(stage);
  assertValidStage(normalizedStage);

  const filter = resolveOrderFilter(orderId);
  if (!filter) {
    const error = new Error('Order id is required');
    error.statusCode = 400;
    throw error;
  }

  const order = await Orders.findOne(filter).lean();
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  // Orders created before the granular stage list (e.g. the old coarse
  // 'design'/'printing' values) never got a bulk migration — normalize them
  // here instead of rejecting the move, so moving/assigning an old order
  // self-heals its stage rather than getting permanently stuck.
  const currentStage = normalizeLegacyStage(normalizeStage(order.stage || 'enquiry'));
  assertValidStage(currentStage);

  if (!isForwardMove(currentStage, normalizedStage)) {
    const error = new Error(`Stage rollback not allowed from ${currentStage} to ${normalizedStage}`);
    error.statusCode = 400;
    throw error;
  }

  // Compare against the raw stored value (not the legacy-normalized one) —
  // otherwise an order still holding an old alias like 'design' would look
  // like a same-stage no-op once normalized to 'new_design' and skip the
  // write entirely, leaving the invalid value stored forever.
  if (normalizeStage(order.stage) === normalizedStage && !statusEntry) {
    return await Orders.findById(order._id);
  }

  const setPayload = {
    stage: normalizedStage,
    stageHistory: { $concatArrays: [
      { $ifNull: ['$stageHistory', []] },
      [{ stage: normalizedStage, timestamp: new Date() }],
    ] },
  };

  if (normalizedStage === 'delivered') {
    setPayload.deliveryNotifiedAt = new Date();
  }

  if (statusEntry) {
    const { Status_number: _ignored, ...baseEntry } = statusEntry;
    setPayload.Status = { $concatArrays: [
      { $ifNull: ['$Status', []] },
      [{ ...baseEntry, Status_number: { $add: [{ $size: { $ifNull: ['$Status', []] } }, 1] } }],
    ] };
  }

  await Orders.findOneAndUpdate({ _id: order._id }, [{ $set: setPayload }], { runValidators: false });

  const updatedOrder = await Orders.findById(order._id);
  const mergedOrder = { ...order, ...(updatedOrder.toObject?.() || {}) };

  if (normalizedStage === 'new_design' || normalizedStage === 'old_design') {
    await autoCreateDesignerTask(mergedOrder);
  }

  if (normalizedStage === 'fitting') {
    await autoCreatePostDesignTask(mergedOrder);
  }

  if (normalizedStage === 'delivered') {
    await notifyDeliveredOrder(mergedOrder);
  }

  return updatedOrder;
};

const getOrderTasks = async (orderId) => {
  const filter = resolveOrderFilter(orderId);
  if (!filter) {
    const error = new Error('Order id is required');
    error.statusCode = 400;
    throw error;
  }

  const order = await Orders.findOne(filter, { _id: 1 }).lean();
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  return await Tasks.find({ orderId: order._id }).sort({ deadline: 1, createdAt: -1 });
};

module.exports = {
  ORDER_STAGES,
  updateOrderStage,
  getOrderTasks,
  autoCreateDesignerTask,
};
