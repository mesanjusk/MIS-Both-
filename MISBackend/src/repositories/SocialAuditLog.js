const mongoose = require('mongoose');

// Accountability trail for the Social Media module — mirrors the shape of
// WhatsAppActionLog.js (this repo's existing audit-log convention).
const SocialAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    entityType: { type: String, enum: ['post', 'account', 'asset', 'job'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    platform: { type: String, default: null },

    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null },
    actorName: { type: String, default: null },

    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    detail: { type: String, default: '' },

    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true, collection: 'socialAuditLogs' }
);

SocialAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
SocialAuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('SocialAuditLog', SocialAuditLogSchema);
