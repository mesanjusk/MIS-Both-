const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const gmailAccountSchema = new mongoose.Schema(
  {
    accountId:      { type: String, unique: true, index: true },
    email:          { type: String, required: true, unique: true, trim: true },
    displayName:    { type: String, default: '' },
    addedBy:        { type: String, default: '' },
    // AES-256-GCM encrypted (via src/utils/crypto.js)
    refreshToken:   { type: String, required: true },
    accessToken:    { type: String, default: null },
    tokenExpiry:    { type: Number, default: null },
    // Daily quota tracking
    dailySentCount: { type: Number, default: 0 },
    dailySentDate:  { type: String, default: '' },   // 'YYYY-MM-DD'
    dailyLimit:     { type: Number, default: 499 },  // conservative below 500/day free limit
    // Status
    isActive:       { type: Boolean, default: true, index: true },
    isConnected:    { type: Boolean, default: true },
    lastUsedAt:     { type: Date, default: null },
    lastError:      { type: String, default: '' },
    lastErrorAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

gmailAccountSchema.pre('validate', function (next) {
  if (!this.accountId) this.accountId = uuidv4();
  next();
});

module.exports = mongoose.model('GmailAccount', gmailAccountSchema);
