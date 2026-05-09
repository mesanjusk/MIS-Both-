const mongoose = require('mongoose');

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
  // Day Book assignment fields
  account_assigned:          { type: String, default: '' },
  entry_status:              { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
  transaction_uuid:          { type: String, default: null },
});

const BankStatementSchema = new mongoose.Schema({
  statement_uuid: { type: String, required: true, unique: true },
  account_name:   { type: String, default: '' },
  uploaded_by:    { type: String, default: '' },
  period_start:   { type: Date },
  period_end:     { type: Date },
  entries:        [bankStatementEntrySchema],
}, { timestamps: true });

BankStatementSchema.index({ statement_uuid: 1 });
BankStatementSchema.index({ 'entries.txn_date': 1 });
BankStatementSchema.index({ 'entries.match_status': 1 });

const BankStatement = mongoose.model('BankStatement', BankStatementSchema);
module.exports = BankStatement;
