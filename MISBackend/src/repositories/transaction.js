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
