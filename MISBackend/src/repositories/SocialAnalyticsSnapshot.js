const mongoose = require('mongoose');
const { SOCIAL_PLATFORMS } = require('../constants/social');

// Periodic snapshot of provider-reported metrics for a published post (or an
// account-level rollup when post is null). Only fields the platform API
// actually returned are populated — never invented/interpolated.
const SocialAnalyticsSnapshotSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', default: null, index: true },
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true, index: true },
    platformPostId: { type: String, default: null },

    capturedAt: { type: Date, default: Date.now, index: true },

    metrics: {
      impressions: { type: Number, default: null },
      reach: { type: Number, default: null },
      likes: { type: Number, default: null },
      comments: { type: Number, default: null },
      shares: { type: Number, default: null },
      saves: { type: Number, default: null },
      engagement: { type: Number, default: null },
      clicks: { type: Number, default: null },
      videoViews: { type: Number, default: null },
      followers: { type: Number, default: null },
      subscribers: { type: Number, default: null },
    },

    // Raw provider response kept for fields not covered above / debugging.
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

SocialAnalyticsSnapshotSchema.index({ account: 1, platform: 1, capturedAt: -1 });
SocialAnalyticsSnapshotSchema.index({ post: 1, capturedAt: -1 });

module.exports = mongoose.model('SocialAnalyticsSnapshot', SocialAnalyticsSnapshotSchema);
