const mongoose = require('mongoose');

// Accountability trail for operations *configuration* changes — priority,
// role, department, working hours, responsibility ownership, store hours.
// Mirrors the shape of WhatsAppActionLog.js / SocialAuditLog.js, this repo's
// existing audit-log convention (one collection per module).
//
// Runtime ownership changes (a task falling to a backup because the primary
// is absent) are deliberately NOT written here: they are derived live from
// attendance and would flood the trail. Only deliberate config edits land here.
const OperationsAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ['user', 'responsibility', 'task', 'store', 'settings'],
      required: true,
    },
    entityId: { type: String, default: '' },
    entityName: { type: String, default: '' },

    field: { type: String, default: '' },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },

    actorUuid: { type: String, default: '' },
    actorName: { type: String, default: '' },
    reason: { type: String, default: '' },
    detail: { type: String, default: '' },
  },
  { timestamps: true, collection: 'operationsAuditLogs' }
);

OperationsAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
OperationsAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('OperationsAuditLog', OperationsAuditLogSchema);
