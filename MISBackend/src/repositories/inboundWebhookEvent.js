const mongoose = require('mongoose');

/**
 * Durable record of an inbound webhook delivery.
 *
 * The WhatsApp webhook verified the signature, answered 200 and then processed
 * the message on setImmediate. Anything that went wrong after that 200 — a
 * crash, a database blip, a bug in processing — lost the delivery for good,
 * because the sender had already been told it succeeded.
 *
 * A row is written here first. The 200 then means "recorded", which is a
 * promise this server can keep, and processing can be retried from the stored
 * payload.
 */
const InboundWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },

    // Identifies the delivery so a provider retry does not create a second row.
    // Unique, which is what makes recording idempotent.
    dedupe_key: { type: String, required: true, unique: true },

    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
      index: true,
    },

    attempts:   { type: Number, default: 0 },
    last_error: { type: String, default: '' },

    // Held by whichever worker is processing the row, so a second sweep does
    // not pick up work already in flight.
    lease_until: { type: Date, default: null },

    processed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// The sweep's query: rows still owed work, oldest first.
InboundWebhookEventSchema.index({ status: 1, lease_until: 1, createdAt: 1 });

module.exports =
  mongoose.models.InboundWebhookEvent ||
  mongoose.model('InboundWebhookEvent', InboundWebhookEventSchema);
