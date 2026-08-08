const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// One row per approve/reject decision on a SocialPost (a post can be
// resubmitted after rejection, so this is a history, not a single field).
const SocialApprovalSchema = new mongoose.Schema(
  {
    approvalUuid: { type: String, default: uuidv4, unique: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', required: true, index: true },

    decision: { type: String, enum: ['APPROVED', 'REJECTED'], required: true },
    reason: { type: String, default: null }, // required for REJECTED, enforced in route

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },
    decidedByName: { type: String, default: null },
    decidedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SocialApprovalSchema.index({ post: 1, createdAt: -1 });

module.exports = mongoose.model('SocialApproval', SocialApprovalSchema);
