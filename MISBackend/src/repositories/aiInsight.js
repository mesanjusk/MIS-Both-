const mongoose = require('mongoose');

// One small, expiring store for suggestions across MIS modules. Store a hash
// of the contact identity, not a phone number or an entire customer chat.
const aiInsightSchema = new mongoose.Schema({
  namespace: { type: String, required: true, index: true },
  subjectHash: { type: String, required: true },
  fingerprint: { type: String, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: 'ai_insights' });

aiInsightSchema.index({ namespace: 1, subjectHash: 1 }, { unique: true });
aiInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AiInsight', aiInsightSchema);
