/**
 * DesignProofLog.js
 *
 * One row per proof sent to a customer for a design file — the audit trail
 * for the send-proof / customer-feedback / revision loop. DesignFileLink
 * only holds the *current* proof state (see proofStatus/proofRevisionCount
 * there); this collection keeps the full history so "how many revisions did
 * this order go through" and "when did the customer actually respond" stay
 * answerable after the fact.
 */

const mongoose = require('mongoose');

const DesignProofLogSchema = new mongoose.Schema(
  {
    proofUuid: { type: String, required: true, unique: true, index: true },

    driveFileId: { type: String, required: true, index: true },
    fileName: { type: String, default: null },

    orderUuid: { type: String, default: null, index: true },
    orderNumber: { type: Number, default: null },

    customerUuid: { type: String, default: null },
    customerName: { type: String, default: null },
    mobileNumber: { type: String, default: null },

    revisionNumber: { type: Number, required: true },

    sentAt: { type: Date, required: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null },
    sentByName: { type: String, default: null },
    note: { type: String, default: '' },
    mediaLink: { type: String, default: null },

    status: {
      type: String,
      enum: ['awaiting_response', 'changes_requested', 'approved'],
      default: 'awaiting_response',
      index: true,
    },

    respondedAt: { type: Date, default: null },
    responseNote: { type: String, default: '' },
    respondedVia: { type: String, enum: ['whatsapp_reply', 'manual', null], default: null },

    nudgesSent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DesignProofLogSchema.index({ driveFileId: 1, sentAt: -1 });

module.exports = mongoose.model('DesignProofLog', DesignProofLogSchema);
