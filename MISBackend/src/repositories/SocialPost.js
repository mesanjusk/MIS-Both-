const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const {
  SOCIAL_PLATFORMS,
  SOCIAL_CONTENT_TYPES,
  SOCIAL_POST_STATUSES,
  SOCIAL_APPROVAL_STATUSES,
} = require('../constants/social');

// Per-platform publish outcome — one entry per platform this post targets.
const PlatformResultSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', default: null },
    status: {
      type: String,
      enum: ['PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
    },
    platformPostId: { type: String, default: null },
    platformUrl: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
    errorClass: { type: String, default: null },
    errorCode: { type: String, default: null },
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);

// Platform-specific fields the Create Post UI collects — only the fields a
// given platform's API actually supports are read by that platform's provider.
const PlatformSettingsSchema = new mongoose.Schema(
  {
    // Instagram / Facebook
    firstComment: { type: String, default: null },
    // YouTube
    youtubeTitle: { type: String, default: null },
    youtubeDescription: { type: String, default: null },
    youtubeTags: { type: [String], default: undefined },
    youtubeCategoryId: { type: String, default: null },
    youtubePrivacy: { type: String, enum: ['public', 'unlisted', 'private'], default: 'public' },
    // LinkedIn
    linkedinVisibility: { type: String, enum: ['PUBLIC', 'CONNECTIONS'], default: 'PUBLIC' },
    // TikTok
    tiktokPrivacyLevel: {
      type: String,
      enum: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
      default: null,
    },
    tiktokDisableComment: { type: Boolean, default: false },
    tiktokDisableDuet: { type: Boolean, default: false },
    tiktokDisableStitch: { type: Boolean, default: false },
  },
  { _id: false }
);

const SocialPostSchema = new mongoose.Schema(
  {
    postUuid: { type: String, default: uuidv4, unique: true, index: true },

    title: { type: String, default: '' }, // internal name, not published
    contentType: { type: String, enum: SOCIAL_CONTENT_TYPES, required: true },

    assets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialMediaAsset' }],

    caption: { type: String, default: '' },
    hashtags: { type: [String], default: [] },

    platforms: { type: [String], enum: SOCIAL_PLATFORMS, default: [] },
    // accountsByPlatform: { instagram: SocialAccount._id, facebook: SocialAccount._id, ... }
    accountsByPlatform: { type: Map, of: mongoose.Schema.Types.ObjectId, default: {} },
    platformSettings: { type: PlatformSettingsSchema, default: () => ({}) },

    scheduledAt: { type: Date, default: null, index: true },
    timezone: { type: String, default: 'Asia/Kolkata' },

    status: { type: String, enum: SOCIAL_POST_STATUSES, default: 'DRAFT', index: true },
    approvalStatus: { type: String, enum: SOCIAL_APPROVAL_STATUSES, default: 'NOT_SUBMITTED', index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
    createdByName: { type: String, default: null },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null },
    approvedByName: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },

    publishedAt: { type: Date, default: null },
    platformResults: { type: [PlatformResultSchema], default: [] },

    retryCount: { type: Number, default: 0 },
    lastError: { type: String, default: null },

    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialCampaign', default: null },

    // Optional link back into the rest of the CRM (order/customer this post
    // promotes), kept generic so it doesn't force a hard FK to one collection.
    linkedEntityType: { type: String, default: null },
    linkedEntityId: { type: String, default: null },
  },
  { timestamps: true }
);

SocialPostSchema.index({ status: 1, scheduledAt: 1 });
SocialPostSchema.index({ createdBy: 1, createdAt: -1 });
SocialPostSchema.index({ platforms: 1 });
SocialPostSchema.index({ campaign: 1 });

module.exports = mongoose.model('SocialPost', SocialPostSchema);
