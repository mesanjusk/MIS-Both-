const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { SOCIAL_PLATFORMS, SOCIAL_ACCOUNT_STATUSES, SOCIAL_ACCOUNT_TYPES } = require('../constants/social');

// Connected social platform account (Page/Channel/Organization/Profile).
// Access/refresh tokens are stored encrypted (see utils/crypto.js with
// SOCIAL_TOKEN_ENCRYPTION_KEY) and are never returned to the frontend as-is —
// routes must strip tokenEncrypted/refreshTokenEncrypted before responding.
const SocialAccountSchema = new mongoose.Schema(
  {
    accountUuid: { type: String, default: uuidv4, unique: true, index: true },

    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true, index: true },
    accountType: { type: String, enum: SOCIAL_ACCOUNT_TYPES, default: 'page' },

    // Platform-side identifiers
    platformAccountId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    username: { type: String, default: null },
    profileImageUrl: { type: String, default: null },

    // Meta-specific: an Instagram business account is always attached to a
    // Facebook Page — keep the parent Page id for reference/refresh calls.
    parentPageId: { type: String, default: null },

    status: { type: String, enum: SOCIAL_ACCOUNT_STATUSES, default: 'CONNECTED', index: true },

    // Encrypted at rest (AES-256-GCM via utils/crypto.js). Never serialized
    // to the frontend — see toSafeJSON below / routes/SocialAccounts.js.
    accessTokenEncrypted: { type: String, default: null, select: false },
    refreshTokenEncrypted: { type: String, default: null, select: false },
    tokenExpiresAt: { type: Date, default: null },
    scopes: { type: [String], default: [] },

    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', default: null },
    connectedByName: { type: String, default: null },
    connectedAt: { type: Date, default: Date.now },
    lastValidatedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },

    // Free-form platform metadata (e.g. YouTube channel stats snapshot,
    // LinkedIn organization vanity name, TikTok creator info flags).
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

SocialAccountSchema.index({ platform: 1, platformAccountId: 1 }, { unique: true });
SocialAccountSchema.index({ platform: 1, status: 1 });

SocialAccountSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ getters: true });
  delete obj.accessTokenEncrypted;
  delete obj.refreshTokenEncrypted;
  return obj;
};

module.exports = mongoose.model('SocialAccount', SocialAccountSchema);
