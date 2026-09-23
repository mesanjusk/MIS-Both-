const mongoose = require('mongoose');
const { backfillEmbeddedLedgerIdentities } = require('../utils/ledgerIdentity');

const bankStatementEntrySchema = new mongoose.Schema({
  entry_uuid:                { type: String, required: true },
  txn_date:                  { type: Date },
  value_date:                { type: Date },
  description:               { type: String, default: '' },
  ref_no:                    { type: String, default: '' },
  debit:                     { type: Number, default: 0 },
  credit:                    { type: Number, default: 0 },
  balance:                   { type: Number, default: 0 },
  direction:                 { type: String, enum: ['in', 'out'] },
  match_status:              { type: String, enum: ['unmatched', 'matched', 'manual'], default: 'unmatched' },
  match_score:               { type: Number, default: 0 },
  matched_diary_uuid:        { type: String, default: null },
  matched_diary_entry_uuid:  { type: String, default: null },
  matched_party:             { type: String, default: '' },
  // Day Book assignment fields. account_assigned remains for backward
  // compatibility; UUID/type fields are the canonical identity going forward.
  account_assigned:          { type: String, default: '' },
  account_assigned_uuid:     { type: String, default: '' },
  account_assigned_name:     { type: String, default: '' },
  account_assigned_type: {
    type: String,
    enum: ['', 'account', 'customer', 'vendor', 'employee'],
    default: '',
  },
  entry_status:              { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
  transaction_uuid:          { type: String, default: null },
});

const BankStatementSchema = new mongoose.Schema({
  statement_uuid: { type: String, required: true, unique: true },
  account_name:   { type: String, default: '' },
  // The actual MIS ledger account represented by this imported bank statement.
  // Older rows may not have this yet; BankStatement routes infer it from the
  // configured "Bank and Account" ledgers and persist the choice on first use.
  ledger_account_uuid: { type: String, default: '' },
  ledger_account_name: { type: String, default: '' },
  // True only after a user explicitly chooses the statement's bank ledger.
  // Auto-detected mappings remain unlocked so improved matching can safely
  // correct an earlier fallback mapping.
  ledger_account_locked: { type: Boolean, default: false },
  uploaded_by:    { type: String, default: '' },
  period_start:   { type: Date },
  period_end:     { type: Date },
  entries:        [bankStatementEntrySchema],
}, { timestamps: true });

BankStatementSchema.pre('save', async function () {
  const changed = await backfillEmbeddedLedgerIdentities(this.entries || []);
  if (changed) this.markModified('entries');
});

// statement_uuid already gets an index from `unique: true` on its field definition above.
BankStatementSchema.index({ 'entries.txn_date': 1 });
BankStatementSchema.index({ 'entries.match_status': 1 });
BankStatementSchema.index({ 'entries.account_assigned_uuid': 1 });
BankStatementSchema.index({ 'entries.transaction_uuid': 1 });

const BankStatement = mongoose.model('BankStatement', BankStatementSchema);
module.exports = BankStatement;
