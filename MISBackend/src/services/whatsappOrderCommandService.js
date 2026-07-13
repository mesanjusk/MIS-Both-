const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const WhatsAppActionLog = require('../repositories/WhatsAppActionLog');
const { assignOrderToUser } = require('./orderTaskService');
const { moveOrderStage, markOrderReady, markOrderDelivered, VALID_STAGES } = require('./businessWorkflowService');
const { resolveStaffFromWhatsApp } = require('./whatsappIdentityService');

const CLOSED_STAGES = new Set(['delivered', 'paid']);
const LIST_LIMIT = 10;

const ORDERS_COMMAND = /^orders?$/i;
const ORDER_DETAIL_COMMAND = /^order\s+(\d+)$/i;

const truncate = (value, max) => {
  const str = String(value ?? '').trim();
  return str.length > max ? `${str.slice(0, Math.max(0, max - 1))}…` : str;
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : 'not set');
const formatAmount = (order) => Number(order.Amount || order.saleSubtotal || 0);

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
  const idx = VALID_STAGES.indexOf(order.stage);
  if (idx === -1 || idx >= VALID_STAGES.length - 1) return null;
  return VALID_STAGES[idx + 1];
}

async function findOrderByUuid(orderUuid) {
  return Orders.findOne({ Order_uuid: orderUuid }).lean();
}

function buildOrderDetailMessage(order, permissions) {
  const next = nextStageFor(order);
  const bodyText = [
    `Order #${order.Order_Number}`,
    `Stage: ${order.stage}`,
    `Due: ${formatDate(order.dueDate)}`,
    `Amount: ₹${formatAmount(order)}`,
  ].join('\n');

  const buttons = [];
  if (next && permissions.advanceOrderStage) {
    const label = next === 'ready' ? 'Mark ready' : next === 'delivered' ? 'Mark delivered' : `Move to ${next}`;
    buttons.push({ id: `act:next:${order.Order_uuid}`, title: truncate(label, 20) });
  }
  if (!order.assignedTo && permissions.assignOrders) {
    buttons.push({ id: `act:assign:${order.Order_uuid}`, title: 'Assign to me' });
  }

  return { bodyText, buttons: buttons.slice(0, 3) };
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

async function executeOrderAction({ action, orderUuid, phone, user, permissions }) {
  const order = await findOrderByUuid(orderUuid);
  if (!order) {
    return { ok: false, message: 'That order no longer exists.' };
  }

  if (action === 'next') {
    if (!permissions.advanceOrderStage) {
      await logAction({ phone, user, action, order, result: 'denied' });
      return { ok: false, message: 'Your role cannot change order stages from WhatsApp.' };
    }

    const next = nextStageFor(order);
    if (!next) {
      return { ok: false, message: `Order #${order.Order_Number} is already at its final stage.` };
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
    return { ok: true, message: `Order #${order.Order_Number} moved to "${next}".` };
  }

  if (action === 'assign') {
    if (!permissions.assignOrders) {
      await logAction({ phone, user, action, order, result: 'denied' });
      return { ok: false, message: 'Your role cannot self-assign orders from WhatsApp.' };
    }

    if (order.assignedTo) {
      return { ok: false, message: `Order #${order.Order_Number} is already assigned.` };
    }

    try {
      await assignOrderToUser({ orderId: order._id, userId: user._id, assignedBy: user.User_name || 'whatsapp', via: 'whatsapp' });
    } catch (error) {
      await logAction({ phone, user, action, order, result: 'error', detail: error.message });
      return { ok: false, message: 'Could not assign that order — please use the app.' };
    }

    await logAction({ phone, user, action, order, result: 'success' });
    return { ok: true, message: `Order #${order.Order_Number} assigned to you.` };
  }

  return { ok: false, message: 'Unknown action.' };
}

// Entry point wired into the WhatsApp inbound pipeline. Only intercepts
// traffic that actually looks like an order command/reply; anything else is
// left untouched (handled: false) so attendance/flow/auto-reply behave
// exactly as before.
async function handleWhatsAppOrderCommand({ payload, sendText, sendButtons, sendList }) {
  const rawText = String(payload?.message || payload?.text || '').trim();
  const replyId = String(payload?.replyId || '');

  const isOrdersList = ORDERS_COMMAND.test(rawText);
  const orderNumberMatch = rawText.match(ORDER_DETAIL_COMMAND);
  const isOrderDetailReply = replyId.startsWith('ord:');
  const isActionRequest = replyId.startsWith('act:');
  const isActionConfirm = replyId.startsWith('ok:');
  const isActionCancel = replyId.startsWith('no:');

  if (!isOrdersList && !orderNumberMatch && !isOrderDetailReply && !isActionRequest && !isActionConfirm && !isActionCancel) {
    return { handled: false };
  }

  const staff = await resolveStaffFromWhatsApp(payload?.from);
  if (!staff) {
    await sendText({ to: payload.from, body: 'Your number is not registered as MIS staff. Contact an admin.' });
    return { handled: true };
  }
  const { user, permissions } = staff;

  if (isOrdersList) {
    const orders = await findOrdersForStaff({ user, permissions });
    if (!orders.length) {
      await sendText({ to: payload.from, body: 'No open orders right now.' });
      return { handled: true };
    }
    await sendList({
      to: payload.from,
      bodyText: `${orders.length} open order${orders.length === 1 ? '' : 's'} for you:`,
      buttonLabel: 'View orders',
      sections: await buildOrderListSections(orders),
    });
    return { handled: true };
  }

  let orderUuid = '';
  if (orderNumberMatch) {
    const order = await Orders.findOne({ Order_Number: Number(orderNumberMatch[1]) }).select('Order_uuid').lean();
    if (!order) {
      await sendText({ to: payload.from, body: `Order #${orderNumberMatch[1]} not found.` });
      return { handled: true };
    }
    orderUuid = order.Order_uuid;
  } else {
    orderUuid = replyId.split(':').pop();
  }

  if (isOrderDetailReply || orderNumberMatch) {
    const order = await findOrderByUuid(orderUuid);
    if (!order) {
      await sendText({ to: payload.from, body: 'That order no longer exists.' });
      return { handled: true };
    }
    const detail = buildOrderDetailMessage(order, permissions);
    if (detail.buttons.length) {
      await sendButtons({ to: payload.from, bodyText: detail.bodyText, buttons: detail.buttons });
    } else {
      await sendText({ to: payload.from, body: detail.bodyText });
    }
    return { handled: true };
  }

  if (isActionRequest) {
    const action = replyId.split(':')[1];
    await sendButtons({
      to: payload.from,
      bodyText: 'Please confirm this action.',
      buttons: [
        { id: `ok:${action}:${orderUuid}`, title: 'Confirm' },
        { id: `no:${action}:${orderUuid}`, title: 'Cancel' },
      ],
    });
    return { handled: true };
  }

  if (isActionCancel) {
    await sendText({ to: payload.from, body: 'Cancelled — no changes made.' });
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
};
