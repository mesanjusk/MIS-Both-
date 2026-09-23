const mongoose = require('mongoose');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * journalSchema – one line of a double-entry journal posting.
 * Account_id is the ledger identity and MUST be a UUID. Account_name is display
 * metadata only; reports and matching must never use it as the identity.
 */
const journalSchema = new mongoose.Schema({
  Account_id: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: (value) => UUID_RE.test(String(value || '').trim()),
      message: 'Journal Account_id must be a ledger UUID, not an account name',
    },
  },
  Account_name: { type: String, default: '' },
  Type:         { type: String, required: true },
  Amount:       { type: Number, required: true },
});

const TransactionSchema = new mongoose.Schema(
  {
    Transaction_uuid: { type: String },
    Transaction_id:   { type: Number },
    Order_uuid:   { type: String, default: null },
    Order_number: { type: Number, default: null },
    Transaction_date: { type: Date, required: true },
    Description:      { type: String, required: true },
    Total_Debit:  { type: Number, required: true },
    Total_Credit: { type: Number, required: true },
    Payment_mode: { type: String, required: true },
    Created_by:   { type: String, required: true },
    image:        { type: String },
    Journal_entry: [journalSchema],
    Customer_uuid: { type: String, default: null },
    Upi_reference:    { type: String, default: '' },
    Upi_status:       { type: String, default: '' },
    Upi_app:          { type: String, default: '' },
    Upi_payee_vpa:    { type: String, default: '' },
    Upi_response_raw: { type: mongoose.Schema.Types.Mixed, default: null },
    Source: { type: String, default: '', index: true },
    Event_key: { type: String, default: undefined },
  },
  { timestamps: true }
);

// Protect all new/edited accounting postings while leaving unrelated updates to
// historical rows possible. Old malformed rows are reported by the audit script;
// they are not rewritten or deleted automatically.
TransactionSchema.pre('validate', function (next) {
  const accountingChanged = this.isNew
    || this.isModified('Journal_entry')
    || this.isModified('Total_Debit')
    || this.isModified('Total_Credit');

  if (!accountingChanged) return next();

  const lines = Array.isArray(this.Journal_entry) ? this.Journal_entry : [];
  if (lines.length < 2) {
    return next(new Error('Transaction requires at least one debit and one credit journal line'));
  }

  let debit = 0;
  let credit = 0;
  for (const [index, line] of lines.entries()) {
    const type = String(line?.Type || '').trim().toLowerCase();
    const amount = Number(line?.Amount);
    if (type !== 'debit' && type !== 'credit') {
      return next(new Error(`Journal_entry[${index}].Type must be Debit or Credit`));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return next(new Error(`Journal_entry[${index}].Amount must be greater than zero`));
    }
    if (type === 'debit') debit += amount;
    else credit += amount;
  }

  const round2 = (value) => Number(Number(value || 0).toFixed(2));
  debit = round2(debit);
  credit = round2(credit);
  const totalDebit = round2(this.Total_Debit);
  const totalCredit = round2(this.Total_Credit);

  if (debit !== credit) {
    return next(new Error(`Journal is not balanced: debit ${debit} != credit ${credit}`));
  }
  if (totalDebit !== totalCredit) {
    return next(new Error(`Transaction totals are not balanced: debit ${totalDebit} != credit ${totalCredit}`));
  }
  if (totalDebit !== debit || totalCredit !== credit) {
    return next(new Error('Transaction totals must equal the journal debit/credit totals'));
  }

  next();
});

TransactionSchema.index({ Transaction_uuid: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ Transaction_id: 1 });
TransactionSchema.index({ Order_uuid: 1 });
TransactionSchema.index({ Order_number: 1 });
TransactionSchema.index({ Transaction_date: 1 });
TransactionSchema.index({ Transaction_date: -1 });
TransactionSchema.index({ Payment_mode: 1 });
TransactionSchema.index({ Created_by: 1 });
TransactionSchema.index({ Customer_uuid: 1 });
TransactionSchema.index({ Upi_reference: 1 });
TransactionSchema.index({ Transaction_date: -1, Created_by: 1 });
TransactionSchema.index(
  { Event_key: 1 },
  { unique: true, partialFilterExpression: { Event_key: { $type: 'string' } } }
);
TransactionSchema.index({ 'Journal_entry.Account_id': 1 });

const Transaction = mongoose.model('Transaction', TransactionSchema);
module.exports = Transaction;
