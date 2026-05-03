const Transaction = require('../repositories/transaction');
const { v4: uuid } = require('uuid');

const SYSTEM_ACCOUNTS = Object.freeze({
  CASH: 'Cash',
  BANK: 'Bank',
  UPI: 'UPI',
  CUSTOMER_RECEIVABLE: 'Customer Receivable',
  CUSTOMER_ADVANCE: 'Customer Advance',
  SALES: 'Sales',
  VENDOR_PAYABLE: 'Vendor Payable',
  VENDOR_ADVANCE: 'Vendor Advance',
  JOB_WORK_EXPENSE: 'Job Work Expense',
  PURCHASE: 'Purchase',
  STOCK: 'Stock',
  GENERAL_EXPENSE: 'General Expense',
});

const BUSINESS_SOURCES = Object.freeze({
  CUSTOMER_ADVANCE: 'business:customer_advance',
  CUSTOMER_INVOICE: 'business:customer_invoice',
  CUSTOMER_RECEIPT: 'business:customer_receipt',
  VENDOR_BILL: 'business:vendor_bill',
  VENDOR_PAYMENT: 'business:vendor_payment',
  PURCHASE: 'business:purchase',
  CASH_EXPENSE: 'business:cash_expense',
});

function money(value) {
  const parsed = Number(String(value ?? '').replace(/[₹,\s]/g, '').trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function assertPositiveAmount(amount) {
  const cleanAmount = money(amount);
  if (cleanAmount <= 0) {
    const error = new Error('Accounting amount must be greater than zero');
    error.statusCode = 400;
    throw error;
  }
  return cleanAmount;
}

function normalizeType(type) {
  const raw = String(type || '').trim().toLowerCase();
  if (raw.startsWith('d')) return 'Debit';
  if (raw.startsWith('c')) return 'Credit';
  return type;
}

function buildLine(account, type, amount) {
  if (!account) {
    const error = new Error('Accounting account is required');
    error.statusCode = 400;
    throw error;
  }

  return {
    Account_id: String(account),
    Type: normalizeType(type),
    Amount: assertPositiveAmount(amount),
  };
}

function validateBalancedJournal(lines = []) {
  if (!Array.isArray(lines) || lines.length < 2) {
    const error = new Error('At least one debit and one credit entry are required');
    error.statusCode = 400;
    throw error;
  }

  let debit = 0;
  let credit = 0;

  for (const line of lines) {
    const amount = assertPositiveAmount(line.Amount);
    const type = normalizeType(line.Type);
    if (type === 'Debit') debit += amount;
    if (type === 'Credit') credit += amount;
  }

  debit = Number(debit.toFixed(2));
  credit = Number(credit.toFixed(2));

  if (debit !== credit) {
    const error = new Error(`Accounting entry is not balanced. Debit ${debit} must equal credit ${credit}.`);
    error.statusCode = 400;
    throw error;
  }

  return { debit, credit };
}

function resolvePaymentAccount(paymentMode = '') {
  const normalized = String(paymentMode || '').trim().toLowerCase();
  if (normalized.includes('upi') || normalized.includes('phonepe') || normalized.includes('gpay') || normalized.includes('google pay') || normalized.includes('paytm')) {
    return SYSTEM_ACCOUNTS.UPI;
  }
  if (normalized.includes('bank') || normalized.includes('neft') || normalized.includes('rtgs') || normalized.includes('imps') || normalized.includes('cheque') || normalized.includes('check')) {
    return SYSTEM_ACCOUNTS.BANK;
  }
  return SYSTEM_ACCOUNTS.CASH;
}

async function getNextTransactionId() {
  const lastTransaction = await Transaction.findOne().sort({ Transaction_id: -1 }).lean();
  return Number(lastTransaction?.Transaction_id || 0) + 1;
}

function buildDescription(prefix, meta = {}) {
  const orderPart = meta.orderNumber ? `Order #${meta.orderNumber}` : meta.orderUuid ? `Order ${meta.orderUuid}` : '';
  const partyPart = meta.partyName ? ` - ${meta.partyName}` : '';
  const notePart = meta.narration ? ` - ${meta.narration}` : '';
  return [prefix, orderPart].filter(Boolean).join(' - ') + partyPart + notePart;
}

async function postBalancedTransaction({
  amount,
  debitAccount,
  creditAccount,
  paymentMode = 'Journal',
  description,
  orderUuid = null,
  orderNumber = null,
  customerUuid = null,
  createdBy = 'system',
  transactionDate = new Date(),
  source = '',
  reference = '',
  allowDuplicate = true,
}) {
  const cleanAmount = assertPositiveAmount(amount);
  const Journal_entry = [
    buildLine(debitAccount, 'Debit', cleanAmount),
    buildLine(creditAccount, 'Credit', cleanAmount),
  ];
  const totals = validateBalancedJournal(Journal_entry);

  if (!allowDuplicate && source) {
    const existing = await Transaction.findOne({
      Source: source,
      ...(orderUuid ? { Order_uuid: String(orderUuid) } : {}),
      ...(orderNumber ? { Order_number: Number(orderNumber) } : {}),
    }).lean();

    if (existing) {
      return { transaction: existing, existing: true };
    }
  }

  const transaction = await Transaction.create({
    Transaction_uuid: uuid(),
    Transaction_id: await getNextTransactionId(),
    Order_uuid: orderUuid || null,
    Order_number: orderNumber ? Number(orderNumber) : null,
    Transaction_date: transactionDate || new Date(),
    Description: String(description || 'Business accounting posting'),
    Total_Debit: totals.debit,
    Total_Credit: totals.credit,
    Payment_mode: String(paymentMode || 'Journal'),
    Created_by: String(createdBy || 'system'),
    Journal_entry,
    Customer_uuid: customerUuid || null,
    Upi_reference: reference || '',
    Source: source || '',
  });

  return { transaction, existing: false };
}

function sourceWithSuffix(baseSource, suffix) {
  return suffix ? `${baseSource}:${suffix}` : baseSource;
}

async function postCustomerAdvance(payload = {}) {
  const paymentAccount = resolvePaymentAccount(payload.paymentMode);
  return postBalancedTransaction({
    amount: payload.amount,
    debitAccount: paymentAccount,
    creditAccount: SYSTEM_ACCOUNTS.CUSTOMER_ADVANCE,
    paymentMode: payload.paymentMode || paymentAccount,
    description: payload.description || buildDescription('Customer advance received', payload),
    orderUuid: payload.orderUuid,
    orderNumber: payload.orderNumber,
    customerUuid: payload.customerUuid,
    createdBy: payload.createdBy,
    transactionDate: payload.transactionDate,
    source: sourceWithSuffix(BUSINESS_SOURCES.CUSTOMER_ADVANCE, payload.sourceSuffix),
    reference: payload.reference,
    allowDuplicate: payload.allowDuplicate !== false,
  });
}

async function postCustomerInvoice(payload = {}) {
  return postBalancedTransaction({
    amount: payload.amount,
    debitAccount: SYSTEM_ACCOUNTS.CUSTOMER_RECEIVABLE,
    creditAccount: SYSTEM_ACCOUNTS.SALES,
    paymentMode: 'Journal',
    description: payload.description || buildDescription('Customer invoice posted', payload),
    orderUuid: payload.orderUuid,
    orderNumber: payload.orderNumber,
    customerUuid: payload.customerUuid,
    createdBy: payload.createdBy,
    transactionDate: payload.transactionDate,
    source: sourceWithSuffix(BUSINESS_SOURCES.CUSTOMER_INVOICE, payload.sourceSuffix),
    reference: payload.reference,
    allowDuplicate: false,
  });
}

async function postCustomerReceipt(payload = {}) {
  const paymentAccount = resolvePaymentAccount(payload.paymentMode);
  return postBalancedTransaction({
    amount: payload.amount,
    debitAccount: paymentAccount,
    creditAccount: SYSTEM_ACCOUNTS.CUSTOMER_RECEIVABLE,
    paymentMode: payload.paymentMode || paymentAccount,
    description: payload.description || buildDescription('Customer payment received', payload),
    orderUuid: payload.orderUuid,
    orderNumber: payload.orderNumber,
    customerUuid: payload.customerUuid,
    createdBy: payload.createdBy,
    transactionDate: payload.transactionDate,
    source: sourceWithSuffix(BUSINESS_SOURCES.CUSTOMER_RECEIPT, payload.sourceSuffix),
    reference: payload.reference,
    allowDuplicate: true,
  });
}

async function postVendorBill(payload = {}) {
  return postBalancedTransaction({
    amount: payload.amount,
    debitAccount: SYSTEM_ACCOUNTS.JOB_WORK_EXPENSE,
    creditAccount: SYSTEM_ACCOUNTS.VENDOR_PAYABLE,
    paymentMode: 'Journal',
    description: payload.description || buildDescription('Vendor bill posted', payload),
    orderUuid: payload.orderUuid,
    orderNumber: payload.orderNumber,
    createdBy: payload.createdBy,
    transactionDate: payload.transactionDate,
    source: sourceWithSuffix(BUSINESS_SOURCES.VENDOR_BILL, payload.sourceSuffix),
    reference: payload.reference,
    allowDuplicate: false,
  });
}

async function postVendorPayment(payload = {}) {
  const paymentAccount = resolvePaymentAccount(payload.paymentMode);
  return postBalancedTransaction({
    amount: payload.amount,
    debitAccount: SYSTEM_ACCOUNTS.VENDOR_PAYABLE,
    creditAccount: paymentAccount,
    paymentMode: payload.paymentMode || paymentAccount,
    description: payload.description || buildDescription('Vendor payment made', payload),
    orderUuid: payload.orderUuid,
    orderNumber: payload.orderNumber,
    createdBy: payload.createdBy,
    transactionDate: payload.transactionDate,
    source: sourceWithSuffix(BUSINESS_SOURCES.VENDOR_PAYMENT, payload.sourceSuffix),
    reference: payload.reference,
    allowDuplicate: true,
  });
}

async function postPurchase(payload = {}) {
  const purchaseAccount = String(payload.purchaseAccount || '').toLowerCase() === 'stock'
    ? SYSTEM_ACCOUNTS.STOCK
    : SYSTEM_ACCOUNTS.PURCHASE;

  return postBalancedTransaction({
    amount: payload.amount,
    debitAccount: purchaseAccount,
    creditAccount: SYSTEM_ACCOUNTS.VENDOR_PAYABLE,
    paymentMode: 'Journal',
    description: payload.description || buildDescription('Purchase posted', payload),
    orderUuid: payload.orderUuid,
    orderNumber: payload.orderNumber,
    createdBy: payload.createdBy,
    transactionDate: payload.transactionDate,
    source: sourceWithSuffix(BUSINESS_SOURCES.PURCHASE, payload.sourceSuffix),
    reference: payload.reference,
    allowDuplicate: payload.allowDuplicate === true,
  });
}

async function postCashExpense(payload = {}) {
  const paymentAccount = resolvePaymentAccount(payload.paymentMode);
  return postBalancedTransaction({
    amount: payload.amount,
    debitAccount: payload.expenseAccount || SYSTEM_ACCOUNTS.GENERAL_EXPENSE,
    creditAccount: paymentAccount,
    paymentMode: payload.paymentMode || paymentAccount,
    description: payload.description || buildDescription('Cash expense posted', payload),
    orderUuid: payload.orderUuid,
    orderNumber: payload.orderNumber,
    createdBy: payload.createdBy,
    transactionDate: payload.transactionDate,
    source: sourceWithSuffix(BUSINESS_SOURCES.CASH_EXPENSE, payload.sourceSuffix),
    reference: payload.reference,
    allowDuplicate: true,
  });
}

module.exports = {
  SYSTEM_ACCOUNTS,
  BUSINESS_SOURCES,
  money,
  resolvePaymentAccount,
  validateBalancedJournal,
  postBalancedTransaction,
  postCustomerAdvance,
  postCustomerInvoice,
  postCustomerReceipt,
  postVendorBill,
  postVendorPayment,
  postPurchase,
  postCashExpense,
};
