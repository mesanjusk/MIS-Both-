const mongoose = require('mongoose');

const SOPCompletionSchema = new mongoose.Schema(
  {
    sop_uuid: { type: String, required: true },
    date: { type: Date, required: true },
    completedBy: { type: String, default: '' },
    completedByName: { type: String, default: '' },
    completedAt: { type: Date },
    skipped: { type: Boolean, default: false },
    skipReason: { type: String, default: '' },
    assignedGroup: { type: String, default: '' },
  },
  { timestamps: true },
);

SOPCompletionSchema.index({ sop_uuid: 1, date: 1 });
SOPCompletionSchema.index({ date: 1 });

const SOPCompletion = mongoose.model('SOPCompletion', SOPCompletionSchema);
module.exports = SOPCompletion;
