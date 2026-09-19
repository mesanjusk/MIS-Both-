// src/utils/voucher.js
//
// A ledger row carries two different numbers and users need both:
//
//  • Transaction No – the running Transaction_id of the double-entry posting.
//  • Voucher No     – the number printed on the document that was shared with
//                     the party (sale invoice, receipt, payment or journal
//                     voucher). For an order-backed sale that is the order /
//                     invoice number, for everything else the transaction id.
//
// The classification here is the single source of truth used by the ledger
// table and by TransactionDocumentModal so both always agree.

export const VOUCHER_TYPES = Object.freeze({
  INVOICE:  'invoice',
  RECEIPT:  'receipt',
  PAYMENT:  'payment',
  PURCHASE: 'purchase',
  JOURNAL:  'journal',
});

export const VOUCHER_LABEL = Object.freeze({
  invoice:  'Invoice',
  receipt:  'Receipt',
  payment:  'Payment',
  purchase: 'Purchase',
  journal:  'Journal',
});

const VOUCHER_PREFIX = Object.freeze({
  invoice:  'INV',
  receipt:  'RCT',
  payment:  'PAY',
  purchase: 'PUR',
  journal:  'JV',
});

const lower = (v) => String(v ?? '').trim().toLowerCase();

/** Sale invoice postings are tagged either with the delivery flow's "invoice"
 *  Source or with the accounting service's business:customer_invoice code. */
export function isInvoiceSource(transaction) {
  const src = lower(transaction?.Source);
  return src === 'invoice' || src.startsWith('business:customer_invoice');
}

export function isPurchaseSource(transaction) {
  const src = lower(transaction?.Source);
  return src.startsWith('business:purchase') || src.startsWith('business:vendor_bill');
}

/** Credit leg posted to the Sales account – the shape produced by the
 *  delivery / invoice flow before Source was recorded on every posting. */
function hasSalesCreditLeg(transaction) {
  return (transaction?.Journal_entry || []).some(
    (e) => lower(e?.Type) === 'credit' &&
      (lower(e?.Account_name) === 'sales' || lower(e?.Account_id) === 'sales')
  );
}

/** True when the row is a sale invoice raised from an order, i.e. one that has
 *  to be edited as an invoice (items × rate) instead of as a raw amount. */
export function isSalesInvoiceTransaction(transaction) {
  if (!transaction) return false;
  const hasOrder = Boolean(transaction.Order_uuid) || Number(transaction.Order_number) > 0;
  if (!hasOrder) return false;
  if (isPurchaseSource(transaction)) return false;
  return isInvoiceSource(transaction) || hasSalesCreditLeg(transaction);
}

/**
 * Pick the leg of a posting that belongs to the party the voucher is addressed
 * to. Party-scoped reports already know which leg that is; a general journal
 * list does not, so it resolves in this order: the transaction's own
 * Customer_uuid, then any leg the caller recognises as a party account, then
 * the debit leg, then whatever came first.
 *
 * @param {object}   transaction
 * @param {function} isPartyAccount  (accountId) => boolean
 */
export function pickPartyLeg(transaction, isPartyAccount = () => false) {
  const legs = transaction?.Journal_entry || [];
  if (!legs.length) return null;

  if (transaction.Customer_uuid) {
    const own = legs.find((l) => l.Account_id === transaction.Customer_uuid);
    if (own) return own;
  }

  const party = legs.find((l) => isPartyAccount(l.Account_id));
  if (party) return party;

  return legs.find((l) => lower(l.Type) === 'debit') || legs[0];
}

const CUSTOMER_CONTROL_NAMES = new Set(['customer receivable', 'customer advance']);

const isCustomerControlLeg = (entry) => {
  const name = lower(entry?.Account_name);
  const id = lower(entry?.Account_id);
  return CUSTOMER_CONTROL_NAMES.has(name) || CUSTOMER_CONTROL_NAMES.has(id);
};

/**
 * Return the journal leg(s) that should appear on one customer's statement.
 *
 * Older/manual invoice rows post directly to the customer's UUID. Newer
 * accounting-service rows keep the customer in Transaction.Customer_uuid and
 * post the GL side to Customer Receivable / Customer Advance. The old
 * Statement screen only recognised the first shape, so valid automated
 * invoices/receipts disappeared from the customer's ledger.
 *
 * Direct customer legs always win. When the transaction belongs to this
 * customer but uses a control account, that control leg is the customer's
 * sub-ledger movement. A source-based synthetic leg is only a last-resort for
 * legacy rows whose control-account name was not preserved.
 */
export function getCustomerLedgerLegs(transaction, customerUuid) {
  const customerId = String(customerUuid || '').trim();
  if (!transaction || !customerId) return [];

  const legs = Array.isArray(transaction.Journal_entry) ? transaction.Journal_entry : [];
  const direct = legs.filter((entry) => String(entry?.Account_id || '').trim() === customerId);
  if (direct.length) return direct;

  if (String(transaction.Customer_uuid || '').trim() !== customerId) return [];

  const control = legs.filter(isCustomerControlLeg);
  if (control.length) return control;

  const amount = Number(transaction.Total_Debit || transaction.Total_Credit || 0);
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const source = lower(transaction.Source);
  if (source === 'invoice' || source.startsWith('business:customer_invoice')) {
    return [{
      Account_id: customerId,
      Account_name: '',
      Type: 'Debit',
      Amount: amount,
      __virtualCustomerLeg: true,
    }];
  }

  if (source.startsWith('business:customer_receipt') || source.startsWith('business:customer_advance')) {
    return [{
      Account_id: customerId,
      Account_name: '',
      Type: 'Credit',
      Amount: amount,
      __virtualCustomerLeg: true,
    }];
  }

  return [];
}

/**
 * Classify a ledger row and derive its voucher number.
 *
 * @param {object}  transaction          the transaction document
 * @param {object}  entry                the journal leg shown on this row (the party's leg)
 * @param {boolean} counterIsCashOrBank  true when the other leg is a cash / bank account,
 *                                       which is what makes a debit a payment out rather
 *                                       than a charge raised on the party
 */
export function getVoucherInfo({ transaction, entry, counterIsCashOrBank = false } = {}) {
  if (!transaction) return { type: VOUCHER_TYPES.JOURNAL, label: VOUCHER_LABEL.journal, number: '', display: '' };

  const type = resolveVoucherType({ transaction, entry, counterIsCashOrBank });

  const number = type === VOUCHER_TYPES.INVOICE && transaction.Order_number
    ? transaction.Order_number
    : (transaction.Transaction_id ?? '');

  return {
    type,
    label: VOUCHER_LABEL[type] || VOUCHER_LABEL.journal,
    number,
    display: number === '' || number == null ? '' : `${VOUCHER_PREFIX[type]}-${number}`,
  };
}

function resolveVoucherType({ transaction, entry, counterIsCashOrBank }) {
  if (isSalesInvoiceTransaction(transaction)) return VOUCHER_TYPES.INVOICE;
  if (isPurchaseSource(transaction)) return VOUCHER_TYPES.PURCHASE;

  const src = lower(transaction.Source);
  if (src.includes('receipt') || src.includes('customer_advance')) return VOUCHER_TYPES.RECEIPT;
  if (src.includes('payment') || src.includes('expense')) return VOUCHER_TYPES.PAYMENT;

  // No usable Source (legacy rows) – fall back to the shape of the entry.
  if (lower(entry?.Type) === 'credit') return VOUCHER_TYPES.RECEIPT;
  if (counterIsCashOrBank) return VOUCHER_TYPES.PAYMENT;
  return VOUCHER_TYPES.JOURNAL;
}
