const mongoose = require('mongoose');

const SOPTaskSchema = new mongoose.Schema(
  {
    sop_uuid: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    section: { type: String, default: '', trim: true },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
    timeOfDay: { type: String, enum: ['morning', 'during_day', 'evening', 'any'], default: 'any' },
    primaryGroup: { type: String, required: true, trim: true },
    fallbackGroups: [{ type: String, trim: true }],
    isSkippable: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    kpi: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

SOPTaskSchema.index({ primaryGroup: 1 });
SOPTaskSchema.index({ frequency: 1, isActive: 1 });
SOPTaskSchema.index({ sortOrder: 1 });

const SOPTask = mongoose.model('SOPTask', SOPTaskSchema);
module.exports = SOPTask;
