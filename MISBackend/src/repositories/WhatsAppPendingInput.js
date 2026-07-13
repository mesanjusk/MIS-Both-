const mongoose = require('mongoose');

// Multi-step WhatsApp conversations that need free-text answers (payment
// amount, order description, ...) — buttons alone can't collect that, so we
// track "what are we waiting for from this phone" here. One active flow per
// phone at a time (unique index); TTL-expires after 10 minutes of inactivity
// so an abandoned conversation doesn't linger forever.
const whatsAppPendingInputSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true },
    action: { type: String, required: true }, // 'pay' | 'createOrder'
    step: { type: String, required: true },
    orderUuid: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'whatsappPendingInputs' }
);

whatsAppPendingInputSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('WhatsAppPendingInput', whatsAppPendingInputSchema);
