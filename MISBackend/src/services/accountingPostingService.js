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
const transactionNumber = require('./transactionNumberService');
const logger = require('../utils/logger');
const { v4: uuid }  = require('uuid');
const {
  getUuid,
  resolve: resolveAccount,
  isUuid,
  updateBalancesForJournal,
  applyBalanceMovement,
} = require('./accountRegistry');
const { parseAmount } = require('../utils/money');

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
  OPENING_BALANCE_EQUITY: 'Opening Balance Equity',
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
  VENDOR_ADVANCE:    'business:vendor_advance',
  VENDOR_OPENING:    'business:vendor_opening',
  VENDOR_LEDGER:     'business:vendor_ledger',
  PURCHASE:          'business:purchase',
  CASH_EXPENSE:      'business:cash_expense',
  BANK_STATEMENT:    'business:bank_statement',
});

// ---------------------------------------------------------------------------
// Pure helpers (synchronous)
// ---------------------------------------------------------------------------

function money(value) {
  return Number(parseAmount(value).toFixed(2));
}

function assertPositiveAmount(amount) {
  const clean = money(amount);
  if (!Number.isFinite(clean) || clean <= 0) {
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

  if (accountName === accountUuid) {
    throw Object.assign(
      new Error(`Account '${accountIdentifier}' not found in Accounts or Customers — cannot determine display name`),
      { statusCode: 400 }
    );
  }

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

  for (const [index, line] of lines.entries()) {
    const amount = assertPositiveAmount(line && line.Amount);
    const type   = normalizeType(line && line.Type);

    // An unrecognized Type used to contribute to neither total, so a journal of
    // nothing but bogus types summed to 0 = 0 and was accepted as balanced.
    // Every line must now declare a side it can be posted on.
    if (type !== 'Debit' && type !== 'Credit') {
      throw Object.assign(
        new Error(
          `Journal_entry[${index}] has an invalid Type '${line && line.Type}' — expected 'Debit' or 'Credit'.`
        ),
        { statusCode: 400 }
      );
    }

    if (type === 'Debit')  debit  += amount;
    if (type === 'Credit') credit += amount;
  }

  debit  = Number(debit.toFixed(2));
  credit = Number(credit.toFixed(2));

  if (debit === 0 || credit === 0) {
    throw Object.assign(
      new Error('At least one debit and one credit entry are required'),
      { statusCode: 400 }
    );
  }

  if (debit !== credit) {
    throw Object.assign(
      new Error(`Accounting entry is not balanced. Debit ${debit} ≠ Credit ${credit}.`),
      { statusCode: 400 }
    );
  }

  return { debit, credit };
}

async function getNextTransactionId() {
  return transactionNumber.allocate();
}

/**
 * Deterministic identity for a business event that must post at most once.
 * Mirrors the fields the previous find-then-create guard matched on, so the
 * same postings are treated as the same event.
 *
 * @returns {string|null} null when there is nothing stable to key on
 */
function buildEventKey({ source, orderUuid, orderNumber, customerUuid }) {
  if (!source) return null;

  // Scope mirrors what the previous find-then-create guard matched on: the
  // order if there is one, else the customer. With neither, that guard matched
  // on Source alone — one posting per source, ever — so the key does too rather
  // than silently dropping the guard.
  const scope = orderUuid
    ? `ou:${String(orderUuid).trim()}`
    : orderNumber
    ? `on:${Number(orderNumber)}`
    : customerUuid
    ? `cu:${String(customerUuid).trim()}`
    : 'source';

  return `${source}|${scope}`;
}

/**
 * Look up an existing posting for a business event, falling back to the
 * pre-Event_key field match so postings made before this field existed are
 * still recognized as duplicates.
 */
async function findByEventKey(eventKey, { source, orderUuid, orderNumber }) {
  const byKey = await Transaction.findOne({ Event_key: eventKey }).lean();
  if (byKey) return byKey;

  return Transaction.findOne({
    Source: source,
    ...(orderUuid   ? { Order_uuid:   String(orderUuid)   } : {}),
    ...(orderNumber ? { Order_number: Number(orderNumber) } : {}),
  }).lean();
}

/**
 * Create the posting, treating a duplicate-key rejection as "someone else
 * posted this event first" rather than an error.
 *
 * @returns {Promise<{doc: object, existing: boolean}>}
 */
async function createTransaction({ eventKey, doc }) {
  try {
    return { doc: await Transaction.create(doc), existing: false };
  } catch (err) {
    const isDuplicateEvent = eventKey && (err.code === 11000 || err.code === 11001);
    if (!isDuplicateEvent) throw err;

    const winner = await Transaction.findOne({ Event_key: eventKey }).lean();
    if (winner) return { doc: winner, existing: true };
    throw err;
  }
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

  // Duplicate-guard: at most one posting per source+order combination when
  // requested. The lookup is only a fast path — two concurrent retries can both
  // see "not found", so the Event_key unique index is what actually decides.
  const eventKey = allowDuplicate ? null : buildEventKey({ source, orderUuid, orderNumber, customerUuid });

  if (eventKey) {
    const existing = await findByEventKey(eventKey, { source, orderUuid, orderNumber });
    if (existing) return { transaction: existing, existing: true };
  }

  const transaction = await createTransaction({
    eventKey,
    doc: {
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
      // Omitted entirely when there is no key — see the partial unique index.
      ...(eventKey ? { Event_key: eventKey } : {}),
    },
  });

  // A concurrent caller won the unique index; its row is the posting.
  if (transaction.existing) return { transaction: transaction.doc, existing: true };

  // Update running balances in the Accounts collection. Awaited so a failure is
  // logged rather than lost; the transaction itself remains the record.
  try {
    await updateBalancesForJournal(Journal_entry);
  } catch (err) {
    logger.error(
      `Account balance update failed after posting txn ${transaction.doc.Transaction_uuid}: ${err.message}`
    );
  }

  return { transaction: transaction.doc, existing: false };
}

/**
 * Create or replace one deterministic business posting.
 *
 * Unlike postBalancedTransaction(), this intentionally updates an existing
 * Source-matched posting when an upstream document is edited. The old journal
 * movement is reversed and the replacement is applied in one net balance pass,
 * preventing edited POs/vendor jobs/steps from leaving stale balances behind.
 */
async function upsertBalancedTransaction({
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
  source,
  reference = '',
}) {
  if (!source) {
    throw Object.assign(new Error('A deterministic Source is required for an accounting upsert'), { statusCode: 400 });
  }

  const cleanAmount = assertPositiveAmount(amount);
  const [debitLine, creditLine] = await Promise.all([
    buildLine(debitAccount, 'Debit', cleanAmount),
    buildLine(creditAccount, 'Credit', cleanAmount),
  ]);
  const Journal_entry = [debitLine, creditLine];
  const totals = validateBalancedJournal(Journal_entry);

  const existing = await Transaction.findOne({ Source: String(source) });
  if (!existing) {
    return postBalancedTransaction({
      amount: cleanAmount,
      debitAccount,
      creditAccount,
      paymentMode,
      description,
      orderUuid,
      orderNumber,
      customerUuid,
      createdBy,
      transactionDate,
      source,
      reference,
      allowDuplicate: false,
    });
  }

  const previousJournal = (existing.Journal_entry || []).map((line) => ({
    Account_id: line.Account_id,
    Account_name: line.Account_name,
    Type: line.Type,
    Amount: line.Amount,
  }));

  existing.Order_uuid = orderUuid || null;
  existing.Order_number = orderNumber ? Number(orderNumber) : null;
  existing.Transaction_date = transactionDate || existing.Transaction_date || new Date();
  existing.Description = String(description || existing.Description || 'Business accounting posting');
  existing.Total_Debit = totals.debit;
  existing.Total_Credit = totals.credit;
  existing.Payment_mode = String(paymentMode || 'Journal');
  existing.Journal_entry = Journal_entry;
  existing.Customer_uuid = customerUuid || null;
  existing.Upi_reference = reference || '';
  existing.Source = String(source);
  await existing.save();

  await applyBalanceMovement({ reverse: previousJournal, apply: Journal_entry });

  return { transaction: existing, existing: true };
}

/**
 * Remove a posted business event and reverse its balance-cache movement.
 * Transaction is the ledger of record; Accounts.Balance is repaired from the
 * exact journal being removed.
 */
async function reverseAndDeleteTransaction(query = {}) {
  const existing = await Transaction.findOne(query);
  if (!existing) return null;
  const journal = (existing.Journal_entry || []).map((line) => ({
    Account_id: line.Account_id,
    Account_name: line.Account_name,
    Type: line.Type,
    Amount: line.Amount,
  }));
  await Transaction.deleteOne({ _id: existing._id });
  await applyBalanceMovement({ reverse: journal });
  return existing;
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

async function postVendorAdvance(payload = {}) {
  const paymentAccountName = resolvePaymentAccountName(payload.paymentMode);
  const source = sourceWithSuffix(BUSINESS_SOURCES.VENDOR_ADVANCE, payload.sourceSuffix);
  return upsertBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    SYSTEM_ACCOUNTS.VENDOR_ADVANCE,
    creditAccount:   paymentAccountName,
    paymentMode:     payload.paymentMode || paymentAccountName,
    description:     payload.description || buildDescription('Vendor advance paid', payload),
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source,
    reference:       payload.reference,
  });
}

async function postVendorOpeningBalance(payload = {}) {
  const isAdvance = String(payload.balanceType || payload.type || '').toLowerCase() === 'advance';
  const source = sourceWithSuffix(BUSINESS_SOURCES.VENDOR_OPENING, payload.sourceSuffix || payload.vendorUuid);
  return upsertBalancedTransaction({
    amount:          payload.amount,
    debitAccount:    isAdvance ? SYSTEM_ACCOUNTS.VENDOR_ADVANCE : SYSTEM_ACCOUNTS.OPENING_BALANCE_EQUITY,
    creditAccount:   isAdvance ? SYSTEM_ACCOUNTS.OPENING_BALANCE_EQUITY : SYSTEM_ACCOUNTS.VENDOR_PAYABLE,
    paymentMode:     'Journal',
    description:     payload.description || `Vendor opening balance - ${payload.partyName || payload.vendorName || ''}`.trim(),
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source,
  });
}

/**
 * Canonical posting for manually-created VendorLedger rows.
 * This prevents the vendor sub-ledger from becoming a second independent set
 * of books: every balance-affecting row gets a unified Transaction_uuid.
 */
async function postVendorLedgerEntry(payload = {}) {
  const entryType = String(payload.entryType || '').trim().toLowerCase();
  const drCr = String(payload.drCr || '').trim().toLowerCase();
  const paymentAccount = resolvePaymentAccountName(payload.paymentMode);
  let debitAccount;
  let creditAccount;

  switch (entryType) {
    case 'opening':
      if (drCr === 'dr') {
        debitAccount = SYSTEM_ACCOUNTS.VENDOR_ADVANCE;
        creditAccount = SYSTEM_ACCOUNTS.OPENING_BALANCE_EQUITY;
      } else {
        debitAccount = SYSTEM_ACCOUNTS.OPENING_BALANCE_EQUITY;
        creditAccount = SYSTEM_ACCOUNTS.VENDOR_PAYABLE;
      }
      break;
    case 'advance_paid':
      debitAccount = SYSTEM_ACCOUNTS.VENDOR_ADVANCE;
      creditAccount = paymentAccount;
      break;
    case 'payment':
      debitAccount = SYSTEM_ACCOUNTS.VENDOR_PAYABLE;
      creditAccount = paymentAccount;
      break;
    case 'job_bill':
      debitAccount = SYSTEM_ACCOUNTS.JOB_WORK_EXPENSE;
      creditAccount = SYSTEM_ACCOUNTS.VENDOR_PAYABLE;
      break;
    case 'material_bill':
      debitAccount = SYSTEM_ACCOUNTS.PURCHASE;
      creditAccount = SYSTEM_ACCOUNTS.VENDOR_PAYABLE;
      break;
    case 'material_issued':
      debitAccount = SYSTEM_ACCOUNTS.VENDOR_ADVANCE;
      creditAccount = SYSTEM_ACCOUNTS.STOCK;
      break;
    case 'debit_note':
      debitAccount = SYSTEM_ACCOUNTS.VENDOR_PAYABLE;
      creditAccount = SYSTEM_ACCOUNTS.PURCHASE;
      break;
    case 'adjustment':
      if (drCr === 'dr') {
        debitAccount = SYSTEM_ACCOUNTS.VENDOR_PAYABLE;
        creditAccount = SYSTEM_ACCOUNTS.GENERAL_EXPENSE;
      } else {
        debitAccount = SYSTEM_ACCOUNTS.GENERAL_EXPENSE;
        creditAccount = SYSTEM_ACCOUNTS.VENDOR_PAYABLE;
      }
      break;
    default:
      throw Object.assign(new Error(`Unsupported vendor ledger entry_type '${entryType}'`), { statusCode: 400 });
  }

  const source = sourceWithSuffix(BUSINESS_SOURCES.VENDOR_LEDGER, payload.sourceSuffix);
  return upsertBalancedTransaction({
    amount:          payload.amount,
    debitAccount,
    creditAccount,
    paymentMode:     entryType === 'payment' || entryType === 'advance_paid' ? (payload.paymentMode || paymentAccount) : 'Journal',
    description:     payload.description || payload.narration || `Vendor ledger ${entryType}`,
    orderUuid:       payload.orderUuid,
    orderNumber:     payload.orderNumber,
    createdBy:       payload.createdBy,
    transactionDate: payload.transactionDate,
    source,
    reference:       payload.reference,
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
  buildEventKey,
  buildLine,
  postBalancedTransaction,
  upsertBalancedTransaction,
  reverseAndDeleteTransaction,
  postCustomerAdvance,
  postCustomerInvoice,
  postCustomerReceipt,
  postVendorBill,
  postVendorAdvance,
  postVendorOpeningBalance,
  postVendorLedgerEntry,
  postVendorPayment,
  postPurchase,
  postCashExpense,
};
