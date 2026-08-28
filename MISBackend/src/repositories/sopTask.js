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
    // When set, ownership resolves through the user-level responsibility chain
    // (Responsibility → primary → backup 1..4 → escalation) instead of
    // the group fallback above. Left empty, the original group behaviour is
    // untouched, so existing seeded SOP tasks keep working exactly as before.
    responsibility_uuid: { type: String, default: '' },
    // Optional direct user override, for a checklist item owned by one person
    // rather than a whole responsibility area.
    primaryUserUuid: { type: String, default: '' },
    backup1UserUuid: { type: String, default: '' },
    backup2UserUuid: { type: String, default: '' },
    backup3UserUuid: { type: String, default: '' },
    backup4UserUuid: { type: String, default: '' },
    // Configurable daily schedule (§22): when it runs, how long, which days.
    scheduledTime: { type: String, default: '' },   // 'HH:MM'
    durationMinutes: { type: Number, default: 0 },
    weekDays: { type: [Number], default: [] },      // empty = every working day
    category: { type: String, default: 'general' },
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
SOPTaskSchema.index({ responsibility_uuid: 1 });

const SOPTask = mongoose.model('SOPTask', SOPTaskSchema);
module.exports = SOPTask;
