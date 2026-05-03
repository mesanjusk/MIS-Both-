const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');
const Orders = require('../repositories/order');
const Counter = require('../repositories/counter');
const Transaction = require('../repositories/transaction');
const Tasks = require('../repositories/tasks');
const Customers = require('../repositories/customer');
const Users = require('../repositories/users');
const VendorMaster = require('../repositories/vendorMaster');
const VendorLedger = require('../repositories/vendorLedger');
const ProductionJob = require('../repositories/productionJob');
const {
  BUSINESS_SOURCES,
  money,
  postCustomerAdvance,
  postCustomerInvoice,
  postCustomerReceipt,
  postVendorBill,
  postVendorPayment,
} = require('./accountingPostingService');
const { buildDefaultDueDate } = require('./orderTaskService');

const VALID_STAGES = ['enquiry', 'quoted', 'approved', 'design', 'printing', 'finishing', 'ready', 'delivered', 'paid'];
const CLOSED_STAGES = new Set(['delivered', 'paid', 'cancelled', 'cancel']);

function nowIstDayBounds(base = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const start = new Date(`${map.year}-${map.month}-${map.day}T00:00:00+05:30`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function cleanString(value) {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[₹,\s]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStage(stage, fallback = 'design') {
  const normalized = cleanString(stage).toLowerCase();
  return VALID_STAGES.includes(normalized) ? normalized : fallback;
}

function buildOrderFilter(orderUuidOrNumber) {
  const id = cleanString(orderUuidOrNumber);
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return { _id: id };
  if (/^\d+$/.test(id)) return { Order_Number: Number(id) };
  return { Order_uuid: id };
}

async function nextCounterValue(id, seed = 0) {
  const current = await Counter.findById(id).lean();
  if (!current?.seq) {
    await Counter.updateOne({ _id: id }, { $max: { seq: seed } }, { upsert: true });
  }
  const updated = await Counter.findByIdAndUpdate(id, { $inc: { seq: 1 } }, { new: true, upsert: true }).lean();
  return Number(updated?.seq || 1);
}

function getLatestStatus(order = {}) {
  const list = Array.isArray(order.Status) ? order.Status : [];
  return list.length ? list[list.length - 1] : null;
}

function getOrderTotal(order = {}) {
  const candidates = [
    order.finalAmount,
    order.totalAmount,
    order.grandTotal,
    order.saleSubtotal,
    order.Amount,
  ].map((value) => money(value));

  const firstPositive = candidates.find((value) => value > 0);
  if (firstPositive) return firstPositive;

  const itemTotal = Array.isArray(order.Items)
    ? order.Items.reduce((sum, item) => sum + money(item?.Amount ?? (toNumber(item?.Quantity) * toNumber(item?.Rate))), 0)
    : 0;

  return money(itemTotal);
}

function isBusinessCustomerReceipt(txn = {}) {
  const source = cleanString(txn.Source).toLowerCase();
  if (source.startsWith(BUSINESS_SOURCES.CUSTOMER_RECEIPT) || source.startsWith(BUSINESS_SOURCES.CUSTOMER_ADVANCE)) return true;
  if (
    source.startsWith(BUSINESS_SOURCES.CUSTOMER_INVOICE) ||
    source.startsWith(BUSINESS_SOURCES.VENDOR_BILL) ||
    source.startsWith(BUSINESS_SOURCES.VENDOR_PAYMENT) ||
    source.startsWith(BUSINESS_SOURCES.PURCHASE) ||
    source.startsWith(BUSINESS_SOURCES.CASH_EXPENSE)
  ) return false;

  const paymentMode = cleanString(txn.Payment_mode).toLowerCase();
  if (paymentMode && paymentMode !== 'journal') return true;

  const lines = Array.isArray(txn.Journal_entry) ? txn.Journal_entry : [];
  const hasCustomerCredit = lines.some((line) => cleanString(line.Account_id).toLowerCase().includes('customer') && cleanString(line.Type).toLowerCase().startsWith('c'));
  const hasCashDebit = lines.some((line) => ['cash', 'bank', 'upi'].includes(cleanString(line.Account_id).toLowerCase()) && cleanString(line.Type).toLowerCase().startsWith('d'));
  return hasCustomerCredit && hasCashDebit;
}

async function getReceivedAmountForOrder(order = {}) {
  const or = [];
  if (order.Order_uuid) or.push({ Order_uuid: order.Order_uuid });
  if (order.Order_Number) or.push({ Order_number: Number(order.Order_Number) });
  if (!or.length) return 0;

  const txns = await Transaction.find({ $or: or }).lean();
  return money(txns.filter(isBusinessCustomerReceipt).reduce((sum, txn) => sum + money(txn.Total_Debit || txn.Total_Credit), 0));
}

async function refreshOrderPaymentStatus({ orderUuid, orderNumber, orderId } = {}) {
  const filter = orderId ? { _id: orderId } : buildOrderFilter(orderUuid || orderNumber);
  if (!filter) return null;

  const order = await Orders.findOne(filter);
  if (!order) return null;

  const total = getOrderTotal(order);
  const received = await getReceivedAmountForOrder(order);
  const outstanding = money(Math.max(total - received, 0));
  const fullyPaid = total > 0 && received >= total;
  const set = {
    billStatus: fullyPaid ? 'paid' : 'unpaid',
    billPaidAt: fullyPaid ? (order.billPaidAt || new Date()) : null,
    billPaidBy: fullyPaid ? (order.billPaidBy || 'system') : null,
    billPaidNote: fullyPaid ? `Auto: received ${received} against total ${total}` : null,
  };

  const currentStage = normalizeStage(order.stage || 'enquiry', 'enquiry');
  const update = { $set: set };
  if (fullyPaid && currentStage === 'delivered') {
    update.$set.stage = 'paid';
    update.$push = { stageHistory: { stage: 'paid', timestamp: new Date() } };
  }

  await Orders.updateOne({ _id: order._id }, update, { runValidators: false });
  const updated = await Orders.findById(order._id).lean();
  return decorateOrderFinancials(updated, { total, received, outstanding });
}

function makeStatusEntry({ task, assigned = 'None', dueDate = null, order = {} }) {
  const last = getLatestStatus(order);
  const nextNo = Number(last?.Status_number || 0) + 1;
  const deliveryDate = dueDate ? new Date(dueDate) : order.dueDate || buildDefaultDueDate();
  return {
    Task: cleanString(task) || 'Task',
    Assigned: cleanString(assigned) || cleanString(last?.Assigned) || 'None',
    Delivery_Date: deliveryDate,
    Status_number: Number.isFinite(nextNo) ? nextNo : 1,
    CreatedAt: new Date(),
  };
}

async function createTaskForOrder({ order, taskName = 'Design', assignedTo = 'None', dueDate = null, taskGroup = 'Order Workflow', appendStatus = true } = {}) {
  if (!order?._id) return null;

  const task = await Tasks.create({
    Task_uuid: uuid(),
    Task_name: `${taskName} - Order #${order.Order_Number}`,
    Task_group: taskGroup,
    orderId: order._id,
    deadline: dueDate || order.dueDate || buildDefaultDueDate(),
    status: 'pending',
  });

  if (appendStatus) {
    const statusEntry = makeStatusEntry({ task: taskName, assigned: assignedTo, dueDate, order });
    await Orders.updateOne({ _id: order._id }, { $push: { Status: statusEntry } }, { runValidators: false });
  }
  return task;
}

async function resolveCustomerName(customerUuid) {
  if (!customerUuid) return '';
  const customer = await Customers.findOne({ Customer_uuid: customerUuid }).lean();
  return customer?.Customer_name || '';
}

async function createQuickOrderWorkflow(payload = {}) {
  const customerUuid = cleanString(payload.Customer_uuid || payload.customerUuid || payload.customer_id);
  if (!customerUuid) {
    const error = new Error('Customer_uuid is required');
    error.statusCode = 400;
    throw error;
  }

  const orderTotal = money(payload.amount ?? payload.Amount ?? payload.totalAmount ?? payload.finalAmount);
  const items = Array.isArray(payload.Items || payload.items) ? (payload.Items || payload.items) : [];
  const normalizedItems = items.length
    ? items.map((item) => {
        const qty = toNumber(item.Quantity ?? item.quantity, 1) || 1;
        const rate = toNumber(item.Rate ?? item.rate, 0);
        const amount = money(item.Amount ?? item.amount ?? qty * rate);
        return {
          Item: cleanString(item.Item || item.item || item.itemName || 'Quick Order'),
          Quantity: qty,
          Rate: rate || amount,
          Amount: amount,
          Priority: cleanString(item.Priority || item.priority || 'Normal'),
          Remark: cleanString(item.Remark || item.remark || item.note || payload.note),
        };
      }).filter((item) => item.Item)
    : [{
        Item: cleanString(payload.itemName || payload.orderTitle || 'Quick Order'),
        Quantity: 1,
        Rate: orderTotal,
        Amount: orderTotal,
        Priority: 'Normal',
        Remark: cleanString(payload.orderNote || payload.note || payload.Remark),
      }];

  const lastOrder = await Orders.findOne({}, { Order_Number: 1 }).sort({ Order_Number: -1 }).lean();
  const orderNumber = await nextCounterValue('order_number', Number(lastOrder?.Order_Number || 0));
  const dueDate = payload.dueDate ? new Date(payload.dueDate) : buildDefaultDueDate();
  const initialStage = normalizeStage(payload.stage, 'design');
  const assigned = cleanString(payload.assignedToName || payload.assignedTo || 'None');

  const order = await Orders.create({
    Order_uuid: uuid(),
    Order_Number: orderNumber,
    Customer_uuid: customerUuid,
    Status: [makeStatusEntry({ task: payload.taskName || 'Design', assigned, dueDate })],
    orderMode: 'items',
    orderNote: cleanString(payload.orderNote || payload.note || payload.Remark),
    Items: normalizedItems,
    Amount: orderTotal,
    stage: initialStage,
    stageHistory: [{ stage: initialStage, timestamp: new Date() }],
    priority: ['low', 'medium', 'high'].includes(cleanString(payload.priority).toLowerCase()) ? cleanString(payload.priority).toLowerCase() : 'medium',
    dueDate,
  });

  await createTaskForOrder({ order, taskName: payload.taskName || 'Design', assignedTo: assigned, dueDate, appendStatus: false });

  const advanceAmount = money(payload.advanceAmount || payload.advance || 0);
  let advancePosting = null;
  if (advanceAmount > 0) {
    advancePosting = await postCustomerAdvance({
      amount: advanceAmount,
      paymentMode: payload.paymentMode || 'Cash',
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      customerUuid,
      createdBy: payload.createdBy || 'system',
      narration: payload.narration || 'Quick order advance',
      reference: payload.reference || '',
    });
    await refreshOrderPaymentStatus({ orderId: order._id });
  }

  return { order: await Orders.findById(order._id).lean(), advancePosting };
}

async function moveOrderStage({ orderUuid, stage, assignedTo = '', note = '', createdBy = 'system' } = {}) {
  const filter = buildOrderFilter(orderUuid);
  if (!filter) {
    const error = new Error('Order id is required');
    error.statusCode = 400;
    throw error;
  }

  const order = await Orders.findOne(filter);
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  const normalizedStage = normalizeStage(stage, order.stage || 'design');
  const statusEntry = makeStatusEntry({ task: normalizedStage, assigned: assignedTo || createdBy || 'System', order });
  await Orders.updateOne(
    { _id: order._id },
    {
      $set: { stage: normalizedStage, ...(assignedTo && mongoose.isValidObjectId(assignedTo) ? { assignedTo } : {}) },
      $push: {
        stageHistory: { stage: normalizedStage, timestamp: new Date() },
        Status: { ...statusEntry, Task: note ? `${normalizedStage} - ${note}` : normalizedStage },
      },
    },
    { runValidators: false }
  );

  return Orders.findById(order._id).lean();
}

async function markOrderReady({ orderUuid, assignedTo = 'Delivery', note = '', createdBy = 'system' } = {}) {
  const order = await moveOrderStage({ orderUuid, stage: 'ready', assignedTo, note, createdBy });
  await createTaskForOrder({ order, taskName: 'Delivery', assignedTo, dueDate: order.dueDate || buildDefaultDueDate(), taskGroup: 'Delivery' });
  return Orders.findById(order._id).lean();
}

async function markOrderDelivered({ orderUuid, deliveredBy = 'system', note = '' } = {}) {
  const order = await moveOrderStage({ orderUuid, stage: 'delivered', assignedTo: deliveredBy, note: note || 'Delivered', createdBy: deliveredBy });
  const total = getOrderTotal(order);
  let invoicePosting = null;

  if (total > 0) {
    invoicePosting = await postCustomerInvoice({
      amount: total,
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      customerUuid: order.Customer_uuid,
      createdBy: deliveredBy,
      partyName: await resolveCustomerName(order.Customer_uuid),
      narration: note || 'Invoice on delivery',
      sourceSuffix: order.Order_uuid,
    });
  }

  const refreshed = await refreshOrderPaymentStatus({ orderId: order._id });
  return { order: refreshed || await Orders.findById(order._id).lean(), invoicePosting };
}

async function receiveOrderPayment({ orderUuid, amount, paymentMode = 'Cash', reference = '', narration = '', createdBy = 'system' } = {}) {
  const filter = buildOrderFilter(orderUuid);
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

  const paymentAmount = money(amount);
  const hasInvoice = await Transaction.exists({ Order_uuid: order.Order_uuid, Source: `${BUSINESS_SOURCES.CUSTOMER_INVOICE}:${order.Order_uuid}` });
  const isAfterInvoice = hasInvoice || ['delivered', 'paid'].includes(normalizeStage(order.stage, 'design'));
  const poster = isAfterInvoice ? postCustomerReceipt : postCustomerAdvance;

  const posting = await poster({
    amount: paymentAmount,
    paymentMode,
    orderUuid: order.Order_uuid,
    orderNumber: order.Order_Number,
    customerUuid: order.Customer_uuid,
    createdBy,
    narration: narration || (isAfterInvoice ? 'Payment received' : 'Advance received'),
    reference,
  });

  const updatedOrder = await refreshOrderPaymentStatus({ orderId: order._id });
  return { order: updatedOrder, posting };
}

function mapJobType(workType = '') {
  const lower = cleanString(workType).toLowerCase();
  if (lower.includes('print')) return 'printing';
  if (lower.includes('laminat')) return 'lamination';
  if (lower.includes('cut')) return 'cutting';
  if (lower.includes('pack')) return 'packing';
  if (lower.includes('purchase')) return 'purchase';
  return 'other';
}

async function ensureVendor(payload = {}) {
  const vendorId = cleanString(payload.vendorId || payload.vendorUuid || payload.vendor_uuid || payload.Vendor_uuid);
  const vendorName = cleanString(payload.vendorName || payload.vendor_name || payload.Vendor_name || payload.name);

  if (vendorId) {
    const existing = await VendorMaster.findOne({ Vendor_uuid: vendorId });
    if (existing) return existing;
  }
  if (vendorName) {
    const byName = await VendorMaster.findOne({ Vendor_name: vendorName });
    if (byName) return byName;
  }
  if (!vendorName) {
    const error = new Error('Vendor name or vendor id is required');
    error.statusCode = 400;
    throw error;
  }

  return VendorMaster.create({
    Vendor_uuid: vendorId || uuid(),
    Vendor_name: vendorName,
    Vendor_type: payload.jobMode === 'vendor_with_material' ? 'mixed' : 'jobwork',
    Active: true,
    Jobwork_capable: true,
    Raw_material_capable: payload.jobMode === 'vendor_with_material',
  });
}

async function assignVendorToOrder({ orderUuid, vendorId, vendorName, amount = 0, dueDate = null, note = '', workType = 'General', createdBy = 'system', jobMode = 'jobwork_only' } = {}) {
  const filter = buildOrderFilter(orderUuid);
  if (!filter) {
    const error = new Error('Order id is required');
    error.statusCode = 400;
    throw error;
  }
  const order = await Orders.findOne(filter);
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  const vendor = await ensureVendor({ vendorId, vendorName, jobMode });
  const assignmentId = uuid();
  const cleanAmount = money(amount);
  const assignment = {
    assignmentId,
    vendorCustomerUuid: vendor.Vendor_uuid,
    vendorUuid: vendor.Vendor_uuid,
    vendorName: vendor.Vendor_name,
    workType: cleanString(workType) || 'General',
    sequence: (Array.isArray(order.vendorAssignments) ? order.vendorAssignments.length : 0) + 1,
    jobMode: ['jobwork_only', 'vendor_with_material', 'own_material_sent', 'mixed'].includes(jobMode) ? jobMode : 'jobwork_only',
    note: cleanString(note),
    amount: cleanAmount,
    dueDate: dueDate ? new Date(dueDate) : null,
    paymentStatus: 'pending',
    status: 'pending',
  };

  order.vendorAssignments = Array.isArray(order.vendorAssignments) ? order.vendorAssignments : [];
  order.vendorAssignments.push(assignment);
  if (!['ready', 'delivered', 'paid'].includes(normalizeStage(order.stage, 'design'))) {
    order.stage = 'printing';
    order.stageHistory = Array.isArray(order.stageHistory) ? order.stageHistory : [];
    order.stageHistory.push({ stage: 'printing', timestamp: new Date() });
  }
  await order.save();

  const jobNumber = await nextCounterValue('production_job_number', 0);
  const productionJob = await ProductionJob.create({
    job_uuid: uuid(),
    job_number: jobNumber,
    job_type: mapJobType(workType),
    job_mode: assignment.jobMode,
    vendor_uuid: vendor.Vendor_uuid,
    vendor_name: vendor.Vendor_name,
    job_date: assignment.dueDate || new Date(),
    status: 'draft',
    linkedOrders: [{
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      orderItemLineId: assignmentId,
      quantity: 0,
      outputQuantity: 0,
      costShareAmount: cleanAmount,
      allocationBasis: 'manual',
    }],
    jobValue: cleanAmount,
    materialValue: assignment.jobMode === 'vendor_with_material' ? cleanAmount : 0,
    notes: assignment.note,
    createdBy,
  });

  let vendorBillPosting = null;
  if (cleanAmount > 0) {
    await VendorLedger.findOneAndUpdate(
      { vendor_uuid: vendor.Vendor_uuid, order_uuid: order.Order_uuid, reference_type: 'business_control_vendor_bill', reference_id: assignmentId },
      {
        $set: {
          vendor_name: vendor.Vendor_name,
          date: new Date(),
          entry_type: assignment.jobMode === 'vendor_with_material' ? 'material_bill' : 'job_bill',
          job_uuid: productionJob.job_uuid,
          order_number: order.Order_Number,
          amount: cleanAmount,
          dr_cr: 'cr',
          narration: assignment.note || `Vendor job for order #${order.Order_Number}`,
          transaction_uuid: '',
        },
      },
      { upsert: true, new: true }
    );

    vendorBillPosting = await postVendorBill({
      amount: cleanAmount,
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      createdBy,
      partyName: vendor.Vendor_name,
      narration: assignment.note || workType,
      sourceSuffix: assignmentId,
    });
  }

  await createTaskForOrder({ order, taskName: `Vendor: ${assignment.workType}`, assignedTo: vendor.Vendor_name, dueDate: assignment.dueDate, taskGroup: 'Vendor' });
  return { order: await Orders.findById(order._id).lean(), vendor, assignment, productionJob, vendorBillPosting };
}

async function payVendorForOrder({ vendorId, orderUuid = '', amount, paymentMode = 'Cash', reference = '', narration = '', createdBy = 'system' } = {}) {
  const vendor = await ensureVendor({ vendorId, vendorUuid: vendorId });
  const order = orderUuid ? await Orders.findOne(buildOrderFilter(orderUuid)).lean() : null;
  const cleanAmount = money(amount);

  const posting = await postVendorPayment({
    amount: cleanAmount,
    paymentMode,
    orderUuid: order?.Order_uuid || null,
    orderNumber: order?.Order_Number || null,
    createdBy,
    partyName: vendor.Vendor_name,
    narration: narration || 'Vendor payment',
    reference,
  });

  await VendorLedger.create({
    vendor_uuid: vendor.Vendor_uuid,
    vendor_name: vendor.Vendor_name,
    date: new Date(),
    entry_type: 'payment',
    order_uuid: order?.Order_uuid || '',
    order_number: order?.Order_Number || null,
    amount: cleanAmount,
    dr_cr: 'dr',
    narration: narration || 'Vendor payment',
    transaction_uuid: posting?.transaction?.Transaction_uuid || '',
    reference_type: 'business_control_vendor_payment',
    reference_id: posting?.transaction?.Transaction_uuid || uuid(),
  });

  if (order?.Order_uuid) {
    const ledgerRows = await VendorLedger.find({ vendor_uuid: vendor.Vendor_uuid, order_uuid: order.Order_uuid }).lean();
    const cr = ledgerRows.filter((row) => row.dr_cr === 'cr').reduce((sum, row) => sum + money(row.amount), 0);
    const dr = ledgerRows.filter((row) => row.dr_cr === 'dr').reduce((sum, row) => sum + money(row.amount), 0);
    const status = dr >= cr && cr > 0 ? 'paid' : dr > 0 ? 'partial' : 'pending';
    await Orders.updateOne(
      { Order_uuid: order.Order_uuid, 'vendorAssignments.vendorUuid': vendor.Vendor_uuid },
      { $set: { 'vendorAssignments.$.paymentStatus': status } },
      { runValidators: false }
    );
  }

  return { vendor, order, posting };
}

function decorateOrderFinancials(order = {}, supplied = {}) {
  if (!order) return order;
  const total = supplied.total ?? getOrderTotal(order);
  const received = supplied.received ?? 0;
  const outstanding = supplied.outstanding ?? money(Math.max(total - received, 0));
  const latestStatus = getLatestStatus(order);
  return {
    ...order,
    orderTotal: total,
    receivedAmount: received,
    outstandingAmount: outstanding,
    latestTask: latestStatus?.Task || order.stage || '',
    responsiblePerson: latestStatus?.Assigned || '',
  };
}

async function decorateOrders(orders = []) {
  const customerUuids = [...new Set(orders.map((order) => order.Customer_uuid).filter(Boolean))];
  const customers = await Customers.find({ Customer_uuid: { $in: customerUuids } }).lean();
  const customerMap = new Map(customers.map((customer) => [customer.Customer_uuid, customer]));

  const result = [];
  for (const order of orders) {
    const received = await getReceivedAmountForOrder(order);
    const total = getOrderTotal(order);
    const customer = customerMap.get(order.Customer_uuid) || {};
    result.push({
      ...decorateOrderFinancials(order, { total, received, outstanding: money(Math.max(total - received, 0)) }),
      customerName: customer.Customer_name || order.customerName || '',
      customerMobile: customer.Mobile_number || '',
    });
  }
  return result;
}

function bucketPayload(rows = []) {
  return { count: rows.length, rows };
}

async function getBusinessControlSummary() {
  const { start, end } = nowIstDayBounds();
  const allOrders = await Orders.find({}).sort({ createdAt: -1 }).limit(800).lean();
  const decorated = await decorateOrders(allOrders);

  const openRows = decorated.filter((order) => !CLOSED_STAGES.has(normalizeStage(order.stage || order.latestTask, 'design')));
  const unassignedRows = openRows.filter((order) => !order.assignedTo && (!order.responsiblePerson || ['none', 'unassigned'].includes(cleanString(order.responsiblePerson).toLowerCase())));
  const readyRows = decorated.filter((order) => normalizeStage(order.stage || order.latestTask, '') === 'ready' || cleanString(order.latestTask).toLowerCase().includes('ready'));
  const readyNotDeliveredRows = readyRows.filter((order) => !['delivered', 'paid'].includes(normalizeStage(order.stage, '')));
  const deliveredUnpaidRows = decorated.filter((order) => ['delivered'].includes(normalizeStage(order.stage, '')) && money(order.outstandingAmount) > 0);

  const ledgerRows = await VendorLedger.find({}).sort({ date: -1, createdAt: -1 }).lean();
  const vendorBalances = Object.values(ledgerRows.reduce((acc, row) => {
    const key = row.vendor_uuid || row.vendor_name || 'Unknown';
    if (!acc[key]) acc[key] = { vendorUuid: row.vendor_uuid, vendorName: row.vendor_name || 'Unknown', debit: 0, credit: 0, balance: 0, rows: [] };
    const amount = money(row.amount);
    if (row.dr_cr === 'dr') acc[key].debit += amount;
    else acc[key].credit += amount;
    acc[key].balance = money(acc[key].credit - acc[key].debit);
    acc[key].rows.push(row);
    return acc;
  }, {})).filter((row) => row.balance > 0).sort((a, b) => b.balance - a.balance);

  const todayTxns = await Transaction.find({ Transaction_date: { $gte: start, $lt: end } }).lean();
  const todayReceiptTxns = todayTxns.filter(isBusinessCustomerReceipt);
  const todayReceiptsAmount = money(todayReceiptTxns.reduce((sum, txn) => sum + money(txn.Total_Debit || txn.Total_Credit), 0));

  const todayDeliveryRows = decorated.filter((order) => {
    const history = Array.isArray(order.stageHistory) ? order.stageHistory : [];
    return history.some((entry) => cleanString(entry.stage).toLowerCase() === 'delivered' && new Date(entry.timestamp) >= start && new Date(entry.timestamp) < end);
  });

  const overdueTaskRows = await Tasks.find({
    status: { $in: ['pending', 'in_progress'] },
    deadline: { $lt: new Date() },
  }).sort({ deadline: 1 }).limit(200).lean();

  return {
    openOrders: bucketPayload(openRows),
    unassignedOrders: bucketPayload(unassignedRows),
    readyNotDelivered: bucketPayload(readyNotDeliveredRows),
    deliveredUnpaid: bucketPayload(deliveredUnpaidRows),
    vendorPayable: { count: vendorBalances.length, amount: money(vendorBalances.reduce((sum, row) => sum + row.balance, 0)), rows: vendorBalances },
    todayReceipts: { count: todayReceiptTxns.length, amount: todayReceiptsAmount, rows: todayReceiptTxns },
    todayDeliveries: bucketPayload(todayDeliveryRows),
    overdueTasks: bucketPayload(overdueTaskRows),
  };
}

module.exports = {
  VALID_STAGES,
  getOrderTotal,
  getReceivedAmountForOrder,
  refreshOrderPaymentStatus,
  createQuickOrderWorkflow,
  createTaskForOrder,
  moveOrderStage,
  markOrderReady,
  markOrderDelivered,
  receiveOrderPayment,
  assignVendorToOrder,
  payVendorForOrder,
  getBusinessControlSummary,
};
