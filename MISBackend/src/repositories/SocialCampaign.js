const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Lightweight grouping entity — the existing CRM has no campaign concept to
// reuse, so posts can optionally be tagged under one of these.
const SocialCampaignSchema = new mongoose.Schema(
  {
    campaignUuid: { type: String, default: uuidv4, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null },
    createdByName: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SocialCampaignSchema.index({ name: 1 });
SocialCampaignSchema.index({ isActive: 1 });

module.exports = mongoose.model('SocialCampaign', SocialCampaignSchema);
