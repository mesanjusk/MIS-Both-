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
  account_assigned: { type: String, default: '' },
  entry_status:     { type: String, enum: ['draft', 'confirmed', 'rejected'], default: 'draft' },
  transaction_uuid: { type: String, default: null },
});

const DiaryDraftSchema = new mongoose.Schema({
  diary_uuid:       { type: String, required: true, unique: true },
  diary_date:       { type: Date, required: true },
  status:           { type: String, enum: ['draft', 'confirmed'], default: 'draft' },
  uploaded_by:      { type: String, required: true },
  opening_balance:  { type: Number, default: 0 },
  closing_balance:  { type: Number, default: 0 },
  entries:          [diaryEntrySchema],
}, { timestamps: true });

DiaryDraftSchema.index({ diary_uuid: 1 });
DiaryDraftSchema.index({ diary_date: -1 });
DiaryDraftSchema.index({ status: 1 });

const DiaryDraft = mongoose.model('DiaryDraft', DiaryDraftSchema);
module.exports = DiaryDraft;
