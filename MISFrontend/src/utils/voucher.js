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
