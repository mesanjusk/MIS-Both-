const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');
const Orders = require('../repositories/order');
const Tasks = require('../repositories/tasks');
const Customers = require('../repositories/customer');
const PaymentFollowup = require('../repositories/paymentFollowup');
const Users = require('../repositories/users');
const Usertasks = require('../repositories/usertask');
const { sendMessage } = require('./metaApiService');
const logger = require('../utils/logger');

const VALID_STAGES = [
  'enquiry',
  'quoted',
  'approved',
  'design',
  'printing',
  'finishing',
  'ready',
  'delivered',
  'paid',
];

const stageIndex = new Map(VALID_STAGES.map((value, index) => [value, index]));

const resolveOrderFilter = (rawId) => {
  const id = String(rawId || '').trim();
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return { _id: id };
  if (/^\d+$/.test(id)) return { Order_Number: Number(id) };
  return { Order_uuid: id };
};

const normalizeStage = (stage) => String(stage || '').trim().toLowerCase();
const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');

const sendEnvWhatsAppText = async ({ to, body }) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp env credentials missing (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)');
  }
  return sendMessage({
    phoneNumberId,
    accessToken,
    payload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: 'text',
      text: { preview_url: false, body },
    },
  });
};

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
    const lastUsertask = await Usertasks.findOne().sort({ Usertask_Number: -1 }).lean();
    const nextNumber = Number(lastUsertask?.Usertask_Number || 0) + 1;
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
      const body = `Dear ${customerName}, your order #${order.Order_Number} is ready for delivery.\n\nAmount due: Rs ${amount}.\n\nPlease arrange payment. Thank you! - ${businessName}`;
      await sendEnvWhatsAppText({ to: mobile, body });
      console.log(`WhatsApp sent to ${mobile} for delivered order #${order.Order_Number}`);
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
  if (!stageIndex.has(stage)) {
    const error = new Error(`Invalid stage. Allowed stages: ${VALID_STAGES.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
};

const updateOrderStage = async ({ orderId, stage }) => {
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

  const currentStage = normalizeStage(order.stage || 'enquiry');
  assertValidStage(currentStage);

  if (stageIndex.get(normalizedStage) < stageIndex.get(currentStage)) {
    const error = new Error(`Stage rollback not allowed from ${currentStage} to ${normalizedStage}`);
    error.statusCode = 400;
    throw error;
  }

  if (currentStage === normalizedStage) {
    return await Orders.findById(order._id);
  }

  const updatePayload = {
    $set: { stage: normalizedStage },
    $push: { stageHistory: { stage: normalizedStage, timestamp: new Date() } },
  };

  if (normalizedStage === 'delivered') {
    updatePayload.$set.deliveryNotifiedAt = new Date();
  }

  await Orders.updateOne({ _id: order._id }, updatePayload);

  const updatedOrder = await Orders.findById(order._id);
  const mergedOrder = { ...order, ...(updatedOrder.toObject?.() || {}) };

  if (normalizedStage === 'design') {
    await autoCreateDesignerTask(mergedOrder);
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
  VALID_STAGES,
  updateOrderStage,
  getOrderTasks,
  autoCreateDesignerTask,
};
