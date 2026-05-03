const mongoose = require('mongoose');

const catalogSessionSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutoReply', required: true, index: true },
    keyword: { type: String, default: '', trim: true, lowercase: true },
    currentStepIndex: { type: Number, default: 0, min: 0 },
    selectionFields: { type: [String], default: [] },
    resultFields: { type: [String], default: [] },
    selectedValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['active', 'completed', 'expired', 'closed'],
      default: 'active',
      index: true,
    },
    expiresAt: { type: Date, default: null, index: true },
    lastInboundText: { type: String, default: '' },
  },
  { timestamps: true }
);

catalogSessionSchema.index(
  { phone: 1, ruleId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = mongoose.model('CatalogSession', catalogSessionSchema);
