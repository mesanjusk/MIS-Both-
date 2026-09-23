const mongoose = require('mongoose');

const diaryEntrySchema = new mongoose.Schema({
  entry_uuid:       { type: String, required: true },
  time_slot:        { type: String, default: '' },
  party:            { type: String, required: true },
  amount:           { type: Number, required: true },
  direction:        { type: String, enum: ['in', 'out'], required: true },
  book:             { type: String, enum: ['cash', 'bank'], required: true },
  mode:             { type: String, default: 'cash' },
  checked:          { type: Boolean, default: false },
  notes:            { type: String, default: '' },
  // Legacy display/input value retained so old UI and records continue to work.
  account_assigned:      { type: String, default: '' },
  // Canonical identity used by new posting/migration code. Existing entries are
  // backfilled only when the value can be resolved without ambiguity.
  account_assigned_uuid: { type: String, default: '' },
  account_assigned_name: { type: String, default: '' },
  account_assigned_type: {
    type: String,
    enum: ['', 'account', 'customer', 'vendor', 'employee'],
    default: '',
  },
  auto_suggested:     { type: Boolean, default: false },
  suggestion_source:  { type: String, default: '' },
  entry_status:       { type: String, enum: ['draft', 'confirmed', 'rejected'], default: 'draft' },
  transaction_uuid:   { type: String, default: null },
});

const DiaryDraftSchema = new mongoose.Schema({
  diary_uuid:       { type: String, required: true, unique: true },
  diary_date:       { type: Date, required: false, default: null },
  status:           { type: String, enum: ['draft', 'confirmed'], default: 'draft' },
  uploaded_by:      { type: String, required: true },
  opening_balance:  { type: Number, default: 0 },
  closing_balance:  { type: Number, default: 0 },
  entries:          [diaryEntrySchema],
}, { timestamps: true });

// diary_uuid already gets an index from `unique: true` on its field definition above.
DiaryDraftSchema.index({ diary_date: -1 });
DiaryDraftSchema.index({ status: 1 });
DiaryDraftSchema.index({ 'entries.account_assigned_uuid': 1 });
DiaryDraftSchema.index({ 'entries.transaction_uuid': 1 });

const DiaryDraft = mongoose.model('DiaryDraft', DiaryDraftSchema);
module.exports = DiaryDraft;
