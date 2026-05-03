const mongoose = require('mongoose');

const autoReplySchema = new mongoose.Schema(
  {
    keyword: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    matchType: {
      type: String,
      enum: ['exact', 'contains', 'starts_with'],
      default: 'contains',
    },

    replyType: {
      type: String,
      enum: ['text', 'template'],
      default: 'text',
    },

    ruleType: {
      type: String,
      enum: ['keyword', 'product_catalog'],
      default: 'keyword',
      index: true,
    },

    reply: {
      type: String,
      trim: true,
      default: '',
      required() {
        return String(this.ruleType || 'keyword') !== 'product_catalog';
      },
    },

    templateLanguage: {
      type: String,
      default: 'en_US',
    },

    catalogRows: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    catalogConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    audienceScope: {
      type: String,
      enum: ['all', 'registered_only'],
      default: 'all',
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    delaySeconds: {
      type: Number,
      default: null,
      min: 0,
      max: 30,
    },
  },
  { timestamps: true }
);

autoReplySchema.index({ isActive: 1, keyword: 1, matchType: 1 });
autoReplySchema.index({ ruleType: 1, isActive: 1 });

module.exports = mongoose.model('AutoReply', autoReplySchema);
