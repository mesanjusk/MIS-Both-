const mongoose = require('mongoose');

// Accountability trail for order changes triggered from a WhatsApp button —
// who (phone + resolved staff user), what action, on which order, and
// whether it was allowed, denied by permission check, or errored.
const whatsAppActionLogSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    userUuid: { type: String, default: '' },
    userName: { type: String, default: '' },
    action: { type: String, required: true },
    orderUuid: { type: String, default: '' },
    orderNumber: { type: Number, default: null },
    result: { type: String, enum: ['success', 'denied', 'error'], required: true },
    detail: { type: String, default: '' },
  },
  { timestamps: true, collection: 'whatsappActionLogs' }
);

whatsAppActionLogSchema.index({ orderUuid: 1 });
whatsAppActionLogSchema.index({ phone: 1, createdAt: -1 });

module.exports = mongoose.model('WhatsAppActionLog', whatsAppActionLogSchema);
