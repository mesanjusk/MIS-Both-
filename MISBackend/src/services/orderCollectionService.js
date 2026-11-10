// Create an internal collection task only after a real customer invoice exists.
// The journal remains authoritative; this service never sends messages or posts money.
const { v4: uuid } = require('uuid');
const Customers = require('../repositories/customer');
const PaymentFollowup = require('../repositories/paymentFollowup');
const { getReceivableBalances, money } = require('./paymentFollowupLedgerService');

async function ensureCollectionFollowup({ order, orderTotal, receivedAmount, createdBy = 'system' } = {}) {
  if (!order?.Order_uuid || !order?.Customer_uuid) return null;
  const outstanding = money(Math.max(0, Number(orderTotal) - Number(receivedAmount)));
  if (outstanding <= 0) return null;

  const customer = await Customers.findOne({ Customer_uuid: order.Customer_uuid }).lean();
  if (!customer?.Customer_name) return null;

  // An order estimate alone is insufficient: verify the customer actually owes
  // money in the journal, and cap the task to that verified receivable.
  const balances = await getReceivableBalances([order.Customer_uuid]);
  const ledgerOutstanding = money(Math.max(0, balances.get(String(order.Customer_uuid)) || 0));
  if (ledgerOutstanding <= 0) return null;

  const amount = Math.min(outstanding, ledgerOutstanding);
  const due = new Date();
  const result = await PaymentFollowup.findOneAndUpdate(
    { source_order_uuid: order.Order_uuid },
    { $setOnInsert: {
      followup_uuid: uuid(),
      source_order_uuid: order.Order_uuid,
      customer_uuid: order.Customer_uuid,
      customer_name: customer.Customer_name,
      baseline_outstanding: ledgerOutstanding,
      amount,
      followup_date: due,
      title: `Order #${order.Order_Number || order.Order_uuid} delivered – collect balance`,
      remark: 'Automatically queued after delivery. Verify amount before sending a reminder.',
      status: 'pending',
      created_by: createdBy,
      history: [{ at: due, by: createdBy, action: 'auto_created', note: 'Delivered order with verified ledger receivable; no reminder sent' }],
    } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  return result;
}

module.exports = { ensureCollectionFollowup };
