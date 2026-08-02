const { v4: uuidv4 } = require('uuid');
const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const WhatsAppActionLog = require('../repositories/WhatsAppActionLog');
const WhatsAppPendingInput = require('../repositories/WhatsAppPendingInput');
const { assignOrderToUser } = require('./orderTaskService');
const {
  moveOrderStage,
  markOrderReady,
  markOrderDelivered,
  receiveOrderPayment,
  createQuickOrderWorkflow,
  getOrderTotal,
  getReceivedAmountForOrder,
} = require('./businessWorkflowService');
const { resolveStaffFromWhatsApp, buildCustomerPhoneQuery } = require('./whatsappIdentityService');
const { renderTemplate } = require('./whatsappTemplateService');
const { ORDER_STAGES, CLOSED_STAGES } = require('../constants/orderStages');
const { normalizePhone } = require('../utils/phone');

const LIST_LIMIT = 10;
const PENDING_TTL_MS = 10 * 60 * 1000;
const PAY_MODE_LABELS = { cash: 'Cash', upi: 'UPI', bank: 'Bank' };

const ORDERS_COMMAND = /^orders?$/i;
const ORDER_DETAIL_COMMAND = /^order\s+(\d+)$/i;
const NEW_ORDER_COMMAND = /^new\s*order$/i;
const CANCEL_COMMAND = /^cancel$/i;

const truncate = (value, max) => {
  const str = String(value ?? '').trim();
  return str.length > max ? `${str.slice(0, Math.max(0, max - 1))}…` : str;
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : 'not set');
const formatAmount = (order) => Number(order.Amount || order.saleSubtotal || 0);

function parseAmountFromText(text) {
  const cleaned = String(text || '').replace(/[₹,\s]/g, '');
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

async function getOutstandingForOrder(order) {
  const total = getOrderTotal(order);
  const received = await getReceivedAmountForOrder(order);
  return Math.max(0, Math.round((total - received) * 100) / 100);
}

async function findOrdersForStaff({ user, permissions }) {
  const filter = permissions.viewScope === 'all'
    ? { stage: { $nin: Array.from(CLOSED_STAGES) } }
    : { assignedTo: user._id, stage: { $nin: Array.from(CLOSED_STAGES) } };

  return Orders.find(filter)
    .select('Order_uuid Order_Number Customer_uuid stage dueDate Amount saleSubtotal assignedTo')
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean();
}

async function buildOrderListSections(orders) {
  const customerUuids = [...new Set(orders.map((o) => o.Customer_uuid).filter(Boolean))];
  const customers = customerUuids.length
    ? await Customers.find({ Customer_uuid: { $in: customerUuids } }).select('Customer_uuid Customer_name').lean()
    : [];
  const nameByUuid = new Map(customers.map((c) => [c.Customer_uuid, c.Customer_name]));

  return [{
    title: 'Open orders',
    rows: orders.map((order) => ({
      id: `ord:${order.Order_uuid}`,
      title: truncate(`#${order.Order_Number} · ${order.stage}`, 24),
      description: truncate(
        `${nameByUuid.get(order.Customer_uuid) || 'Customer'} · due ${formatDate(order.dueDate)} · ₹${formatAmount(order)}`,
        72
      ),
    })),
  }];
}

function nextStageFor(order) {
  if (CLOSED_STAGES.has(order.stage)) return null;
  const idx = ORDER_STAGES.indexOf(order.stage);
  if (idx === -1) return null;
  // 'lost'/'cancelled' are explicit exits a user must choose deliberately,
  // never an automatic "next" suggestion in the normal forward sequence.
  for (let i = idx + 1; i < ORDER_STAGES.length; i += 1) {
    if (ORDER_STAGES[i] === 'lost' || ORDER_STAGES[i] === 'cancelled') continue;
    return ORDER_STAGES[i];
  }
  return null;
}

async function findOrderByUuid(orderUuid) {
  return Orders.findOne({ Order_uuid: orderUuid }).lean();
}

// A restricted (viewScope !== 'all') staff member may only view/act on orders
// assigned to them — the "orders" list already filters this way, but detail
// lookups by tapping a row or typing "order <number>" must enforce it too, or
// a restricted user could reach any order by guessing its number.
function isOrderInScope(order, user, permissions) {
  if (permissions.viewScope === 'all') return true;
  return Boolean(order.assignedTo) && String(order.assignedTo) === String(user._id);
}

async function buildOrderDetailMessage(order, permissions) {
  const next = nextStageFor(order);
  const outstanding = await getOutstandingForOrder(order);
  const header = await renderTemplate('order.detail_header', {
    orderNumber: order.Order_Number,
    stage: order.stage,
    due: formatDate(order.dueDate),
    amount: formatAmount(order),
  });
  const bodyLines = [header.body];
  if (outstanding > 0) {
    const outstandingLine = await renderTemplate('order.detail_outstanding_line', { outstanding });
    bodyLines.push(outstandingLine.body);
  }

  const buttons = [];
  if (next && permissions.advanceOrderStage) {
    const labelKey = next === 'ready'
      ? 'order.detail_button_ready'
      : next === 'delivered'
        ? 'order.detail_button_delivered'
        : 'order.detail_button_move';
    const { body: label } = await renderTemplate(labelKey, { stage: next });
    buttons.push({ id: `act:next:${order.Order_uuid}`, title: truncate(label, 20) });
  }
  if (!order.assignedTo && permissions.assignOrders) {
    const { body: label } = await renderTemplate('order.detail_button_assign');
    buttons.push({ id: `act:assign:${order.Order_uuid}`, title: label });
  }
  if (outstanding > 0 && permissions.receivePayments) {
    const { body: label } = await renderTemplate('order.detail_button_pay');
    buttons.push({ id: `act:pay:${order.Order_uuid}`, title: label });
  }

  return { bodyText: bodyLines.join('\n'), buttons: buttons.slice(0, 3) };
}

async function logAction({ phone, user, action, order, result, detail = '' }) {
  try {
    await WhatsAppActionLog.create({
      phone,
      userUuid: user?.User_uuid || '',
      userName: user?.User_name || '',
      action,
      orderUuid: order?.Order_uuid || '',
      orderNumber: order?.Order_Number ?? null,
      result,
      detail,
    });
  } catch (_err) {
    // A logging failure must never block the WhatsApp reply.
  }
}

async function setPending(phone, fields) {
  await WhatsAppPendingInput.findOneAndUpdate(
    { phone: normalizePhone(phone) },
    { $set: { ...fields, expiresAt: new Date(Date.now() + PENDING_TTL_MS) } },
    { upsert: true }
  );
}

async function clearPending(phone) {
  await WhatsAppPendingInput.deleteOne({ phone: normalizePhone(phone) });
}

// ── Payment collection ──────────────────────────────────────────────────
async function startPaymentFlow({ orderUuid, phone, user, permissions, sendText }) {
  if (!permissions.receivePayments) {
    await logAction({ phone, user, action: 'pay', order: { Order_uuid: orderUuid }, result: 'denied' });
    const { body } = await renderTemplate('order.pay_denied');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  const order = await findOrderByUuid(orderUuid);
  if (!order || !isOrderInScope(order, user, permissions)) {
    const { body } = await renderTemplate('order.not_found');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  const outstanding = await getOutstandingForOrder(order);
  if (outstanding <= 0) {
    const { body } = await renderTemplate('order.no_outstanding', { orderNumber: order.Order_Number });
    await sendText({ to: phone, body });
    return { handled: true };
  }

  await setPending(phone, { action: 'pay', step: 'awaiting_amount', orderUuid: order.Order_uuid, data: {} });
  const { body } = await renderTemplate('order.pay_ask_amount', { orderNumber: order.Order_Number, outstanding });
  await sendText({ to: phone, body });
  return { handled: true };
}

async function handlePaymentTextStep({ pending, rawText, phone, sendText, sendButtons }) {
  if (pending.step !== 'awaiting_amount') {
    const { body } = await renderTemplate('order.pay_use_buttons');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  const amount = parseAmountFromText(rawText);
  if (amount === null) {
    const { body } = await renderTemplate('order.pay_invalid_amount');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  const order = await findOrderByUuid(pending.orderUuid);
  if (!order) {
    const { body } = await renderTemplate('order.not_found');
    await sendText({ to: phone, body });
    return { handled: true };
  }
  const outstanding = await getOutstandingForOrder(order);
  if (amount > outstanding) {
    const { body } = await renderTemplate('order.pay_amount_too_high', { outstanding });
    await sendText({ to: phone, body });
    return { handled: true };
  }

  await setPending(phone, { action: 'pay', step: 'awaiting_mode', orderUuid: pending.orderUuid, data: { amount } });
  const { body, buttons } = await renderTemplate('order.pay_mode_prompt', { amount, orderUuid: pending.orderUuid });
  await sendButtons({ to: phone, bodyText: body, buttons });
  return { handled: true };
}

async function handlePayModeReply({ replyId, phone, sendText, sendButtons }) {
  const parts = replyId.split(':');
  const mode = parts[1];
  const orderUuid = parts.slice(2).join(':');

  const pending = await WhatsAppPendingInput.findOne({ phone: normalizePhone(phone) }).lean();
  if (!pending || pending.action !== 'pay' || pending.step !== 'awaiting_mode' || pending.orderUuid !== orderUuid) {
    const { body } = await renderTemplate('order.pay_step_expired');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  // Re-render the mode-prompt template to read back whichever label the admin
  // has configured for the tapped button, so the confirm text always matches
  // what the user actually saw and tapped.
  const modePrompt = await renderTemplate('order.pay_mode_prompt', { amount: pending.data.amount, orderUuid });
  const tappedButton = modePrompt.buttons.find((btn) => btn.id === replyId);
  const label = tappedButton?.title || PAY_MODE_LABELS[mode] || mode;

  await setPending(phone, { action: 'pay', step: 'confirm', orderUuid, data: { ...pending.data, paymentMode: label } });

  const order = await findOrderByUuid(orderUuid);
  const { body, buttons } = await renderTemplate('order.pay_confirm', {
    amount: pending.data.amount,
    mode: label,
    orderNumber: order?.Order_Number ?? '',
    orderUuid,
  });
  await sendButtons({ to: phone, bodyText: body, buttons });
  return { handled: true };
}

// ── Order creation ──────────────────────────────────────────────────────
async function startCreateOrderFlow({ phone, user, permissions, sendText }) {
  if (!permissions.createOrders) {
    await logAction({ phone, user, action: 'createOrder', order: null, result: 'denied' });
    const { body } = await renderTemplate('order.create_denied');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  await setPending(phone, { action: 'createOrder', step: 'awaiting_customer_phone', orderUuid: '', data: {} });
  const { body } = await renderTemplate('order.create_ask_phone');
  await sendText({ to: phone, body });
  return { handled: true };
}

async function handleCreateOrderTextStep({ pending, rawText, phone, sendText, sendButtons }) {
  if (pending.step === 'awaiting_customer_phone') {
    const last10 = rawText.replace(/\D/g, '').slice(-10);
    if (last10.length !== 10) {
      const { body } = await renderTemplate('order.create_invalid_phone');
      await sendText({ to: phone, body });
      return { handled: true };
    }

    const customer = await Customers.findOne(buildCustomerPhoneQuery(last10)).lean();
    if (customer) {
      await setPending(phone, {
        action: 'createOrder',
        step: 'awaiting_description',
        data: { customerUuid: customer.Customer_uuid, customerName: customer.Customer_name },
      });
      const { body } = await renderTemplate('order.create_customer_found', { customerName: customer.Customer_name });
      await sendText({ to: phone, body });
      return { handled: true };
    }

    await setPending(phone, {
      action: 'createOrder',
      step: 'awaiting_new_customer_name',
      data: { newCustomerMobile: last10 },
    });
    const { body } = await renderTemplate('order.create_ask_new_name');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  if (pending.step === 'awaiting_new_customer_name') {
    const name = rawText.trim().slice(0, 120);
    if (!name) {
      const { body } = await renderTemplate('order.create_invalid_name');
      await sendText({ to: phone, body });
      return { handled: true };
    }

    const created = await Customers.create({
      Customer_uuid: uuidv4(),
      Customer_name: name,
      Mobile_number: pending.data.newCustomerMobile,
      Customer_group: 'Customer',
      Status: 'active',
      Tags: ['whatsapp'],
    });

    await setPending(phone, {
      action: 'createOrder',
      step: 'awaiting_description',
      data: { customerUuid: created.Customer_uuid, customerName: created.Customer_name },
    });
    const { body } = await renderTemplate('order.create_customer_created', { customerName: created.Customer_name });
    await sendText({ to: phone, body });
    return { handled: true };
  }

  if (pending.step === 'awaiting_description') {
    const note = rawText.trim().slice(0, 300);
    if (!note) {
      const { body } = await renderTemplate('order.create_invalid_description');
      await sendText({ to: phone, body });
      return { handled: true };
    }

    await setPending(phone, { action: 'createOrder', step: 'awaiting_amount', data: { ...pending.data, orderNote: note } });
    const { body } = await renderTemplate('order.create_ask_amount');
    await sendText({ to: phone, body });
    return { handled: true };
  }

  if (pending.step === 'awaiting_amount') {
    const amount = parseAmountFromText(rawText);
    if (amount === null) {
      const { body } = await renderTemplate('order.create_invalid_amount');
      await sendText({ to: phone, body });
      return { handled: true };
    }

    await setPending(phone, { action: 'createOrder', step: 'confirm', data: { ...pending.data, amount } });
    const { body, buttons } = await renderTemplate('order.create_confirm', {
      customerName: pending.data.customerName,
      note: pending.data.orderNote,
      amount,
    });
    await sendButtons({ to: phone, bodyText: body, buttons });
    return { handled: true };
  }

  const { body } = await renderTemplate('order.create_use_buttons');
  await sendText({ to: phone, body });
  return { handled: true };
}

async function executeCreateOrder({ phone, user, permissions }) {
  // findOneAndDelete atomically claims and consumes the pending draft, so two
  // near-simultaneous "Confirm" taps can't both pass this check and create
  // the order twice — the second one always finds nothing left to claim.
  const pending = await WhatsAppPendingInput.findOneAndDelete({
    phone: normalizePhone(phone),
    action: 'createOrder',
    step: 'confirm',
  }).lean();
  if (!pending) {
    const { body } = await renderTemplate('order.create_draft_expired');
    return { ok: false, message: body };
  }

  if (!permissions.createOrders) {
    await logAction({ phone, user, action: 'createOrder', order: null, result: 'denied' });
    const { body } = await renderTemplate('order.create_denied');
    return { ok: false, message: body };
  }

  try {
    const { order: createdOrder } = await createQuickOrderWorkflow({
      Customer_uuid: pending.data.customerUuid,
      amount: pending.data.amount,
      orderNote: pending.data.orderNote,
      createdBy: user.User_name || 'whatsapp',
    });
    await logAction({ phone, user, action: 'createOrder', order: createdOrder, result: 'success', detail: `₹${pending.data.amount}` });
    const { body } = await renderTemplate('order.create_success', {
      orderNumber: createdOrder.Order_Number,
      customerName: pending.data.customerName,
      amount: pending.data.amount,
    });
    return { ok: true, message: body };
  } catch (error) {
    await logAction({ phone, user, action: 'createOrder', order: null, result: 'error', detail: error.message });
    const { body } = await renderTemplate('order.create_error');
    return { ok: false, message: body };
  }
}

// ── Stage-advance / assign / payment execution ──────────────────────────
async function executeOrderAction({ action, orderUuid, phone, user, permissions }) {
  if (action === 'createOrder') {
    return executeCreateOrder({ phone, user, permissions });
  }

  const order = await findOrderByUuid(orderUuid);
  if (!order) {
    const { body } = await renderTemplate('order.not_found');
    return { ok: false, message: body };
  }

  if ((action === 'next' || action === 'pay') && !isOrderInScope(order, user, permissions)) {
    await logAction({ phone, user, action, order, result: 'denied' });
    const { body } = await renderTemplate('order.not_found');
    return { ok: false, message: body };
  }

  if (action === 'next') {
    if (!permissions.advanceOrderStage) {
      await logAction({ phone, user, action, order, result: 'denied' });
      const { body } = await renderTemplate('order.stage_denied');
      return { ok: false, message: body };
    }

    const next = nextStageFor(order);
    if (!next) {
      const { body } = await renderTemplate('order.stage_final', { orderNumber: order.Order_Number });
      return { ok: false, message: body };
    }

    const createdBy = user.User_name || 'whatsapp';
    if (next === 'ready') {
      await markOrderReady({ orderUuid: order.Order_uuid, createdBy });
    } else if (next === 'delivered') {
      await markOrderDelivered({ orderUuid: order.Order_uuid, deliveredBy: createdBy });
    } else {
      await moveOrderStage({ orderUuid: order.Order_uuid, stage: next, createdBy });
    }

    await logAction({ phone, user, action, order, result: 'success', detail: `-> ${next}` });
    const { body } = await renderTemplate('order.stage_moved', { orderNumber: order.Order_Number, stage: next });
    return { ok: true, message: body };
  }

  if (action === 'assign') {
    if (!permissions.assignOrders) {
      await logAction({ phone, user, action, order, result: 'denied' });
      const { body } = await renderTemplate('order.assign_denied');
      return { ok: false, message: body };
    }

    if (order.assignedTo) {
      const { body } = await renderTemplate('order.assign_already', { orderNumber: order.Order_Number });
      return { ok: false, message: body };
    }

    try {
      await assignOrderToUser({ orderId: order._id, userId: user._id, assignedBy: user.User_name || 'whatsapp', via: 'whatsapp' });
    } catch (error) {
      await logAction({ phone, user, action, order, result: 'error', detail: error.message });
      const { body } = await renderTemplate('order.assign_error');
      return { ok: false, message: body };
    }

    await logAction({ phone, user, action, order, result: 'success' });
    const { body } = await renderTemplate('order.assign_success', { orderNumber: order.Order_Number });
    return { ok: true, message: body };
  }

  if (action === 'pay') {
    // findOneAndDelete atomically claims and consumes the pending payment, so
    // two near-simultaneous "Confirm" taps can't both pass this check and
    // post the payment twice — the second one always finds nothing to claim.
    const pending = await WhatsAppPendingInput.findOneAndDelete({
      phone: normalizePhone(phone),
      action: 'pay',
      step: 'confirm',
      orderUuid: order.Order_uuid,
    }).lean();
    if (!pending) {
      const { body } = await renderTemplate('order.pay_step_expired');
      return { ok: false, message: body };
    }

    if (!permissions.receivePayments) {
      await logAction({ phone, user, action, order, result: 'denied' });
      const { body } = await renderTemplate('order.pay_denied');
      return { ok: false, message: body };
    }

    const amount = Number(pending.data.amount);
    const paymentMode = pending.data.paymentMode || 'Cash';

    try {
      const { order: updatedOrder } = await receiveOrderPayment({
        orderUuid: order.Order_uuid,
        amount,
        paymentMode,
        narration: 'WhatsApp payment',
        createdBy: user.User_name || 'whatsapp',
      });
      await logAction({ phone, user, action, order, result: 'success', detail: `₹${amount} via ${paymentMode}` });
      const outstanding = await getOutstandingForOrder(updatedOrder || order);
      const { body } = await renderTemplate('order.pay_recorded', {
        amount,
        mode: paymentMode,
        orderNumber: order.Order_Number,
        outstanding,
      });
      return { ok: true, message: body };
    } catch (error) {
      await logAction({ phone, user, action, order, result: 'error', detail: error.message });
      const { body } = await renderTemplate('order.pay_error');
      return { ok: false, message: body };
    }
  }

  const { body } = await renderTemplate('order.unknown_action');
  return { ok: false, message: body };
}

// ── Entry point ──────────────────────────────────────────────────────────
// Wired into the WhatsApp inbound pipeline. Only intercepts traffic that
// looks like an order command/reply, or continues an in-progress
// payment/order-creation conversation; anything else is left untouched
// (handled: false) so attendance/flow/auto-reply behave exactly as before.
async function handleWhatsAppOrderCommand({ payload, sendText, sendButtons, sendList }) {
  const rawText = String(payload?.message || payload?.text || '').trim();
  const replyId = String(payload?.replyId || '');
  const isInteractive = Boolean(replyId);

  const isOrdersList = !isInteractive && ORDERS_COMMAND.test(rawText);
  const isNewOrderCommand = !isInteractive && NEW_ORDER_COMMAND.test(rawText);
  const orderNumberMatch = !isInteractive ? rawText.match(ORDER_DETAIL_COMMAND) : null;
  const isOrderDetailReply = replyId.startsWith('ord:');
  const isActionRequest = replyId.startsWith('act:');
  const isPayModeReply = replyId.startsWith('paymode:');
  const isActionConfirm = replyId.startsWith('ok:');
  const isActionCancel = replyId.startsWith('no:');

  const pending = !isInteractive
    ? await WhatsAppPendingInput.findOne({ phone: normalizePhone(payload?.from) }).lean()
    : null;

  if (
    !isOrdersList && !isNewOrderCommand && !orderNumberMatch && !isOrderDetailReply &&
    !isActionRequest && !isPayModeReply && !isActionConfirm && !isActionCancel && !pending
  ) {
    return { handled: false };
  }

  const staff = await resolveStaffFromWhatsApp(payload?.from);
  if (!staff) {
    // Not a staff number — let the customer command handler (tried next in
    // the pipeline) decide whether this sender has an order account.
    return { handled: false };
  }
  const { user, permissions } = staff;

  // A free-text answer to an in-progress conversation takes priority over
  // the command grammar below — e.g. "500" is an amount, not junk.
  if (pending) {
    if (CANCEL_COMMAND.test(rawText)) {
      await clearPending(payload.from);
      const { body } = await renderTemplate('order.cancelled');
      await sendText({ to: payload.from, body });
      return { handled: true };
    }
    if (pending.action === 'pay') {
      return handlePaymentTextStep({ pending, rawText, phone: payload.from, sendText, sendButtons });
    }
    if (pending.action === 'createOrder') {
      return handleCreateOrderTextStep({ pending, rawText, phone: payload.from, sendText, sendButtons });
    }
    await clearPending(payload.from);
  }

  if (isOrdersList) {
    const orders = await findOrdersForStaff({ user, permissions });
    if (!orders.length) {
      const { body } = await renderTemplate('order.list_empty');
      await sendText({ to: payload.from, body });
      return { handled: true };
    }
    const { body, listButtonLabel } = await renderTemplate('order.list_intro', {
      count: orders.length,
      plural: orders.length === 1 ? '' : 's',
    });
    await sendList({
      to: payload.from,
      bodyText: body,
      buttonLabel: listButtonLabel,
      sections: await buildOrderListSections(orders),
    });
    return { handled: true };
  }

  if (isNewOrderCommand) {
    return startCreateOrderFlow({ phone: payload.from, user, permissions, sendText });
  }

  if (isPayModeReply) {
    return handlePayModeReply({ replyId, phone: payload.from, sendText, sendButtons });
  }

  let orderUuid = '';
  if (orderNumberMatch) {
    const order = await Orders.findOne({ Order_Number: Number(orderNumberMatch[1]) }).select('Order_uuid').lean();
    if (!order) {
      const { body } = await renderTemplate('order.number_not_found', { orderNumber: orderNumberMatch[1] });
      await sendText({ to: payload.from, body });
      return { handled: true };
    }
    orderUuid = order.Order_uuid;
  } else {
    orderUuid = replyId.split(':').pop();
  }

  if (isOrderDetailReply || orderNumberMatch) {
    const order = await findOrderByUuid(orderUuid);
    if (!order || !isOrderInScope(order, user, permissions)) {
      const { body } = await renderTemplate('order.not_found');
      await sendText({ to: payload.from, body });
      return { handled: true };
    }
    const detail = await buildOrderDetailMessage(order, permissions);
    if (detail.buttons.length) {
      await sendButtons({ to: payload.from, bodyText: detail.bodyText, buttons: detail.buttons });
    } else {
      await sendText({ to: payload.from, body: detail.bodyText });
    }
    return { handled: true };
  }

  if (isActionRequest) {
    const action = replyId.split(':')[1];

    if (action === 'pay') {
      return startPaymentFlow({ orderUuid, phone: payload.from, user, permissions, sendText });
    }

    const { body, buttons } = await renderTemplate('order.action_confirm_generic', { action, orderUuid });
    await sendButtons({ to: payload.from, bodyText: body, buttons });
    return { handled: true };
  }

  if (isActionCancel) {
    const action = replyId.split(':')[1];
    if (action === 'pay' || action === 'createOrder') {
      await clearPending(payload.from);
    }
    const { body } = await renderTemplate('order.cancelled');
    await sendText({ to: payload.from, body });
    return { handled: true };
  }

  if (isActionConfirm) {
    const action = replyId.split(':')[1];
    const result = await executeOrderAction({ action, orderUuid, phone: payload.from, user, permissions });
    await sendText({ to: payload.from, body: result.message });
    return { handled: true };
  }

  return { handled: false };
}

module.exports = {
  handleWhatsAppOrderCommand,
  findOrdersForStaff,
  buildOrderListSections,
  findOrderByUuid,
  buildOrderDetailMessage,
  executeOrderAction,
  nextStageFor,
  parseAmountFromText,
  // Exposed for unit testing — otherwise only reachable through the command
  // handler above.
  isOrderInScope,
  truncate,
  formatDate,
  formatAmount,
};
