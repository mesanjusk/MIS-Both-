const mongoose = require('mongoose');

const ScheduledMessageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, required: true },
  sendAt: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'sending', 'sent', 'failed'], default: 'scheduled' },

  /**
   * Held by whichever poll is sending this row.
   *
   * The scheduler polls every five seconds and used to select rows with no
   * claim at all, so a send that took longer than one poll was picked up again
   * by the next one and delivered twice. A poll now claims a row before
   * sending; the lease is what lets a row whose process died be retried rather
   * than stranded in 'sending' forever.
   */
  leaseUntil: { type: Date, default: null },
  attempts:   { type: Number, default: 0 },
  lastError:  { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
});

// Indexes to manage scheduled message queue
ScheduledMessageSchema.index({ sessionId: 1 });
ScheduledMessageSchema.index({ to: 1 });
ScheduledMessageSchema.index({ sendAt: 1 });
ScheduledMessageSchema.index({ status: 1 });
// The claim query: due, unclaimed, oldest first.
ScheduledMessageSchema.index({ status: 1, sendAt: 1, leaseUntil: 1 });

module.exports = mongoose.model('ScheduledMessage', ScheduledMessageSchema);
