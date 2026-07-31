const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const { getOrderTotal, getReceivedAmountForOrder } = require('./businessWorkflowService');
const { buildCustomerPhoneQuery } = require('./whatsappIdentityService');
const { renderTemplate } = require('./whatsappTemplateService');

const LIST_LIMIT = 10;
const MY_ORDERS_COMMAND = /^(my\s*orders?|orders?)$/i;

// Deliberately does NOT support "order <number>" free-text lookup like the
// staff command set does — a customer typing arbitrary order numbers would
// let them probe other customers' orders. Customers can only reach an order
// by tapping a row from their own list (myord:<uuid>), and the detail
// handler re-checks Customer_uuid ownership before showing anything.
const truncate = (value, max) => {
  const str = String(value ?? '').trim();
  return str.length > max ? `${str.slice(0, Math.max(0, max - 1))}…` : str;
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : 'not set');
const formatAmount = (order) => Number(order.Amount || order.saleSubtotal || 0);

async function resolveCustomerFromWhatsApp(rawPhone) {
  return Customers.findOne(buildCustomerPhoneQuery(rawPhone)).lean();
}

async function getOutstandingForOrder(order) {
  const total = getOrderTotal(order);
  const received = await getReceivedAmountForOrder(order);
  return Math.max(0, Math.round((total - received) * 100) / 100);
}

async function findOrdersForCustomer(customer) {
  return Orders.find({ Customer_uuid: customer.Customer_uuid, isTemporary: { $ne: true } })
    .select('Order_uuid Order_Number stage createdAt Amount saleSubtotal')
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean();
}

function buildCustomerOrderListSections(orders) {
  return [{
    title: 'Your orders',
    rows: orders.map((order) => ({
      id: `myord:${order.Order_uuid}`,
      title: truncate(`#${order.Order_Number} · ${order.stage}`, 24),
      description: truncate(`Placed ${formatDate(order.createdAt)} · ₹${formatAmount(order)}`, 72),
    })),
  }];
}

async function buildCustomerOrderDetailMessage(order) {
  const outstanding = await getOutstandingForOrder(order);
  const header = await renderTemplate('customer.detail_header', {
    orderNumber: order.Order_Number,
    stage: order.stage,
    amount: formatAmount(order),
  });
  const footer = outstanding > 0
    ? await renderTemplate('customer.detail_footer_due', { outstanding })
    : await renderTemplate('customer.detail_footer_paid');
  return [header.body, footer.body].join('\n');
}

// Entry point wired into the WhatsApp inbound pipeline, tried only after the
// staff command handler finds no matching staff record for the sender.
// Read-only by design: no stage changes, no assignment, no payment posting —
// this is the customer-facing replacement for sharing an invoice wa.me link.
async function handleWhatsAppCustomerOrderCommand({ payload, sendText, sendList }) {
  const rawText = String(payload?.message || payload?.text || '').trim();
  const replyId = String(payload?.replyId || '');
  const isInteractive = Boolean(replyId);

  const isMyOrders = !isInteractive && MY_ORDERS_COMMAND.test(rawText);
  const isDetailReply = replyId.startsWith('myord:');

  if (!isMyOrders && !isDetailReply) {
    return { handled: false };
  }

  const customer = await resolveCustomerFromWhatsApp(payload?.from);
  if (!customer) {
    const { body } = await renderTemplate('customer.no_account');
    await sendText({ to: payload.from, body });
    return { handled: true };
  }

  if (isMyOrders) {
    const orders = await findOrdersForCustomer(customer);
    if (!orders.length) {
      const { body } = await renderTemplate('customer.no_orders');
      await sendText({ to: payload.from, body });
      return { handled: true };
    }
    const { body, listButtonLabel } = await renderTemplate('customer.list_intro', {
      count: orders.length,
      plural: orders.length === 1 ? '' : 's',
    });
    await sendList({
      to: payload.from,
      bodyText: body,
      buttonLabel: listButtonLabel,
      sections: buildCustomerOrderListSections(orders),
    });
    return { handled: true };
  }

  if (isDetailReply) {
    const orderUuid = replyId.split(':').pop();
    const order = await Orders.findOne({ Order_uuid: orderUuid }).lean();

    // Ownership check — never show an order that isn't this customer's,
    // even if the id looks well-formed.
    if (!order || order.Customer_uuid !== customer.Customer_uuid) {
      const { body } = await renderTemplate('customer.order_not_found');
      await sendText({ to: payload.from, body });
      return { handled: true };
    }

    const body = await buildCustomerOrderDetailMessage(order);
    await sendText({ to: payload.from, body });
    return { handled: true };
  }

  return { handled: false };
}

module.exports = {
  handleWhatsAppCustomerOrderCommand,
  resolveCustomerFromWhatsApp,
  findOrdersForCustomer,
  buildCustomerOrderDetailMessage,
};
