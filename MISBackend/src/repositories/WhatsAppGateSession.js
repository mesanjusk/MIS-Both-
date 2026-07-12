const mongoose = require('mongoose');

// Keyword-gate session for the shared WhatsApp number: MIS only responds to a
// sender while their session is open. A session is opened ONLY by the MIS
// entry keyword, is refreshed by in-session activity, expires after 30 minutes
// of inactivity, and closes on EXIT.
const whatsAppGateSessionSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    gateOpenedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'whatsappGateSessions' }
);

module.exports = mongoose.model('WhatsAppGateSession', whatsAppGateSessionSchema);
