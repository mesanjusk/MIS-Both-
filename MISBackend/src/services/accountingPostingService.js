/**
 * accountingPostingService.js
 *
 * Central double-entry accounting engine.  Every financial event in the system
 * MUST be posted through this module so that all accounting entries flow into
 * the single unified Transaction collection.
 *
 * Key design decisions
 * ─────────────────────
 * • Account_id in every journal line is an Account_uuid (FK → Accounts collection),
 *   never a raw account-name string.
 * • Account_name is stored alongside the UUID as a denormalized display label.
 * • Every posting validates that Σ Debit = Σ Credit before writing to the DB.
 * • Account balances are updated atomically after each successful posting.
 * • Source codes (BUSINESS_SOURCES) allow any module to trace which business
 *   event generated a particular transaction.
 */

const Transaction = require('../repositories/transaction');
const { v4: uuid }  = require('uuid');
const {
  getUuid,
  resolve: resolveAccount,
  isUuid,
  updateBalancesForJournal,
} = require('./accountRegistry');

// ---------------------------------------------------------------------------
// System account NAMES – used only as lookup keys, never stored raw in records.
// The registry converts these to stable UUIDs at runtime.
// ---------------------------------------------------------------------------
const SYSTEM_ACCOUNTS = Object.freeze({
  CASH:                'Cash',
  BANK:                'Bank',
  UPI:                 'UPI',
  CUSTOMER_RECEIVABLE: 'Customer Receivable',
  CUSTOMER_ADVANCE:    'Customer Advance',
  SALES:               'Sales',
  VENDOR_PAYABLE:      'Vendor Payable',
  VENDOR_ADVANCE:      'Vendor Advance',
  JOB_WORK_EXPENSE:    'Job Work Expense',
  PURCHASE:            'Purchase',
  STOCK:               'Stock',
  GENERAL_EXPENSE:     'General Expense',
});

// ---------------------------------------------------------------------------
// Source codes – identify the originating business event for each transaction.
// ---------------------------------------------------------------------------
const BUSINESS_SOURCES = Object.freeze({
  CUSTOMER_ADVANCE:  'business:customer_advance',
  CUSTOMER_INVOICE:  'business:customer_invoice',
  CUSTOMER_RECEIPT:  'business:customer_receipt',
  VENDOR_BILL:       'business:vendor_bill',
  VENDOR_PAYMENT:    'business:vendor_payment',
  PURCHASE:          'business:purchase',
  CASH_EXPENSE:      'business:cash_expense',
  BANK_STATEMENT:    'business:bank_statement',
});

// ---------------------------------------------------------------------------
// Pure helpers (synchronous)
// ---------------------------------------------------------------------------

function money(value) {
  const parsed = Number(String(value ?? '').replace(/[₹,\s]/g, '').trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function assertPositiveAmount(amount) {
  const clean = money(amount);
  if (clean <= 0) {
    throw Object.assign(new Error('Accounting amount must be greater than zero'), { statusCode: 400 });
  }
  return clean;
}

function normalizeType(type) {
  const raw = String(type || '').trim().toLowerCase();
  if (raw.startsWith('d')) return 'Debit';
  if (raw.startsWith('c')) return 'Credit';
  return type;
}

function buildDescription(prefix, meta = {}) {
  const orderPart = meta.orderNumber
    ? `Order #${meta.orderNumber}`
    : meta.orderUuid
    ? `Order ${meta.orderUuid}`
    : '';
  const partyPart  = meta.partyName   ? ` - ${meta.partyName}`  : '';
  const notePart   = meta.narration   ? ` - ${meta.narration}`  : '';
  return [prefix, orderPart].filter(Boolean).join(' - ') + partyPart + notePart;
}

function sourceWithSuffix(baseSource, suffix) {
  return suffix ? `${baseSource}:${suffix}` : baseSource;
}

function resolvePaymentAccountName(paymentMode = '') {
  const n = String(paymentMode || '').trim().toLowerCase();
  if (n.includes('upi') || n.includes('phonepe') || n.includes('gpay') || n.includes('google pay') || n.includes('paytm')) {
    return SYSTEM_ACCOUNTS.UPI;
  }
  if (n.includes('bank') || n.includes('neft') || n.includes('rtgs') || n.includes('imps') || n.includes('cheque') || n.includes('check')) {
    return SYSTEM_ACCOUNTS.BANK;
  }
  return SYSTEM_ACCOUNTS.CASH;
}

// ---------------------------------------------------------------------------
// Async helpers – UUID resolution
// ---------------------------------------------------------------------------

/**
 * Build one journal line, resolving the account identifier to a UUID.
 * Accepts either an account name string or an already-resolved UUID.
 *
 * Returns { Account_id (uuid), Account_name, Type, Amount }
 */
async function buildLine(accountIdentifier, type, amount) {
  if (!accountIdentifier) {
    throw Object.assign(new Error('Accounting account is required'), { statusCode: 400 });
  }

  const { uuid: accountUuid, name: accountName } = await resolveAccount(accountIdentifier);

  return {
    Account_id:   accountUuid,  // UUID – stored as FK in the journal
    Account_name: accountName,  // Denormalized display label
    Type:         normalizeType(type),
    Amount:       assertPositiveAmount(amount),
  };
}

/**
 * Validate that journal lines are balanced (Σ Debit = Σ Credit).
 * Returns { debit, credit } totals.
 */
function validateBalancedJournal(lines = []) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw Object.assign(
      new Error('At least one debit and one credit entry are required'),
      { statusCode: 400 }
    );
  }

  let debit  = 0;
  let credit = 0;

  for (const line of lines) {
    const amount = assertPositiveAmount(line.Amount);
    const type   = normalizeType(line.Type);
    if (type === 'Debit')  debit  += amount;
    if (type === 'Credit') credit += amount;
  }

  debit  = Number(debit.toFixed(2));
  credit = Number(credit.toFixed(2));

  if (debit !== credit) {
    throw Object.assign(
      new Error(`Accounting entry is not balanced. Debit ${debit} ≠ Credit ${credit}.`),
      { statusCode: 400 }
    );
  }

  return { debit, credit };
}

async function getNextTransactionId() {
  const last = await Transaction.findOne().sort({ Transaction_id: -1 }).lean();
  return Number(last?.Transaction_id || 0) + 1;
}

// ---------------------------------------------------------------------------
// Core posting function
// ---------------------------------------------------------------------------

/**
 * Post a balanced two-line (debit / credit) transaction.
 *
 * Both debitAccount and creditAccount may be:
 *   - An account name string   → auto-resolved to UUID via accountRegistry
 *   - An Account_uuid string   → used directly
 *
 * @returns {{ transaction: TransactionDoc, existing: boolean }}
 */
async function postBalancedTransaction({
  amount,
  debitAccount,
  creditAccount,
  paymentMode     = 'Journal',
  description,
  orderUuid       = null,
  orderNumber     = null,
  customerUuid    = null,
  createdBy       = 'system',
  transactionDate = new Date(),
  source          = '',
  reference       = '',
  allowDuplicate  = true,
}) {
  const cleanAmount   = assertPositiveAmount(amount);

  // Resolve both accounts concurrently
  const [debitLine, creditLine] = await Promise.all([
    buildLine(debitAccount,  'Debit',  cleanAmount),
    buildLine(creditAccount, 'Credit', cleanAmount),
  ]);

  const Journal_entry = [debitLine, creditLine];
  const totals        = validateBalancedJournal(Journal_entry);

  // Duplicate-guard: only one posting per source+order combination when requested
  if (!allowDuplicate && source) {
    const existing = await Transaction.findOne({
      Source: source,
      ...(orderUuid   ? { Order_uuid:   String(orderUuid)      } : {}),
      ...(orderNumber ? { Order_number: Number(orderNumber) } : {}),
    }).lean();

    if (existing) return { transaction: existing, existing: true };
  }

  const transaction = await Transaction.create({
    Transaction_uuid: uuid(),
    Transaction_id:   await getNextTransactionId(),
    Order_uuid:       orderUuid  || null,
    Order_number:     orderNumber ? Number(orderNumber) : null,
    Transaction_date: transactionDate || new Date(),
    Description:      String(description || 'Business accounting posting'),
    Total_Debit:      totals.debit,
    Total_Credit:     totals.credit,
    Payment_mode:     String(paymentMode || 'Journal'),
    Created_by:       String(createdBy   || 'system'),
    Journal_entry,
    Customer_uuid:    customerUuid || null,
    Upi_reference:    reference    || '',
    Source:           source       || '',
  });

  // Update running balances in the Accounts collection (best-effort; non-blocking)
  updateBalancesForJournal(Journal_entry).catch(() => {});

  return { transaction, existing: false };
}

// ---------------------------------------------------------------------------
// Business-event posting helpers
// ---------------------------------------------------------------------------

async function postCustomerAdvance(payload = {}) {
  const paymentAccountName = resolvePaymentAccountName(payload.paymentMode);
  return postBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    paymentAccountName,
    creditAccount:   SYSTEM_ACCOUNTS.CUSTOMER_ADVANCE,
    paymentMode:     payload.paymentMode || paymentAccountName,
    description:     payload.description || buildDescription('Customer advance received', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    customerUuid:    payload.customerUuid,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source:          sourceWithSuffix(BUSINESS_SOURCES.CUSTOMER_ADVANCE, payload.sourceSuffix),
    reference:       payload.reference,
    allowDuplicate:  payload.allowDuplicate !== false,
  });
}

async function postCustomerInvoice(payload = {}) {
  return postBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    SYSTEM_ACCOUNTS.CUSTOMER_RECEIVABLE,
    creditAccount:   SYSTEM_ACCOUNTS.SALES,
    paymentMode:     'Journal',
    description:     payload.description || buildDescription('Customer invoice posted', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    customerUuid:    payload.customerUuid,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source:          sourceWithSuffix(BUSINESS_SOURCES.CUSTOMER_INVOICE, payload.sourceSuffix),
    reference:       payload.reference,
    allowDuplicate:  false,
  });
}

async function postCustomerReceipt(payload = {}) {
  const paymentAccountName = resolvePaymentAccountName(payload.paymentMode);
  return postBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    paymentAccountName,
    creditAccount:   SYSTEM_ACCOUNTS.CUSTOMER_RECEIVABLE,
    paymentMode:     payload.paymentMode || paymentAccountName,
    description:     payload.description || buildDescription('Customer payment received', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    customerUuid:    payload.customerUuid,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source:          sourceWithSuffix(BUSINESS_SOURCES.CUSTOMER_RECEIPT, payload.sourceSuffix),
    reference:       payload.reference,
    allowDuplicate:  true,
  });
}

async function postVendorBill(payload = {}) {
  return postBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    SYSTEM_ACCOUNTS.JOB_WORK_EXPENSE,
    creditAccount:   SYSTEM_ACCOUNTS.VENDOR_PAYABLE,
    paymentMode:     'Journal',
    description:     payload.description || buildDescription('Vendor bill posted', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source:          sourceWithSuffix(BUSINESS_SOURCES.VENDOR_BILL, payload.sourceSuffix),
    reference:       payload.reference,
    allowDuplicate:  false,
  });
}

async function postVendorPayment(payload = {}) {
  const paymentAccountName = resolvePaymentAccountName(payload.paymentMode);
  return postBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    SYSTEM_ACCOUNTS.VENDOR_PAYABLE,
    creditAccount:   paymentAccountName,
    paymentMode:     payload.paymentMode || paymentAccountName,
    description:     payload.description || buildDescription('Vendor payment made', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source:          sourceWithSuffix(BUSINESS_SOURCES.VENDOR_PAYMENT, payload.sourceSuffix),
    reference:       payload.reference,
    allowDuplicate:  true,
  });
}

async function postPurchase(payload = {}) {
  const purchaseAccountName =
    String(payload.purchaseAccount || '').toLowerCase() === 'stock'
      ? SYSTEM_ACCOUNTS.STOCK
      : SYSTEM_ACCOUNTS.PURCHASE;

  return postBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    purchaseAccountName,
    creditAccount:   SYSTEM_ACCOUNTS.VENDOR_PAYABLE,
    paymentMode:     'Journal',
    description:     payload.description || buildDescription('Purchase posted', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source:          sourceWithSuffix(BUSINESS_SOURCES.PURCHASE, payload.sourceSuffix),
    reference:       payload.reference,
    allowDuplicate:  payload.allowDuplicate === true,
  });
}

async function postCashExpense(payload = {}) {
  const paymentAccountName = resolvePaymentAccountName(payload.paymentMode);
  return postBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    payload.expenseAccount || SYSTEM_ACCOUNTS.GENERAL_EXPENSE,
    creditAccount:   paymentAccountName,
    paymentMode:     payload.paymentMode || paymentAccountName,
    description:     payload.description || buildDescription('Cash expense posted', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source:          sourceWithSuffix(BUSINESS_SOURCES.CASH_EXPENSE, payload.sourceSuffix),
    reference:       payload.reference,
    allowDuplicate:  true,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  SYSTEM_ACCOUNTS,
  BUSINESS_SOURCES,
  money,
  resolvePaymentAccountName,
  validateBalancedJournal,
  buildLine,
  postBalancedTransaction,
  postCustomerAdvance,
  postCustomerInvoice,
  postCustomerReceipt,
  postVendorBill,
  postVendorPayment,
  postPurchase,
  postCashExpense,
};
