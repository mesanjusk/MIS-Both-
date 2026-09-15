const mongoose = require('mongoose');

/**
 * Append-only record of every mutation to a transaction.
 *
 * Transactions can be edited and deleted in place, which leaves no trace of
 * what a figure used to be or who changed it. This collection is that trace:
 * rows are only ever inserted, never updated or removed, so the history of a
 * posting survives the posting itself.
 *
 * `before` and `after` hold the financially meaningful fields only — enough to
 * reconstruct what changed without copying attachments or UPI payloads.
 */
const TransactionAuditSchema = new mongoose.Schema(
  {
    Transaction_uuid: { type: String, required: true, index: true },
    Transaction_id:   { type: Number, default: null },

    action:     { type: String, required: true, enum: ['create', 'edit', 'delete'] },
    actor:      { type: String, required: true },
    actor_id:   { type: String, default: '' },

    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after:  { type: mongoose.Schema.Types.Mixed, default: null },

    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

TransactionAuditSchema.index({ Transaction_uuid: 1, at: -1 });

module.exports =
  mongoose.models.TransactionAudit ||
  mongoose.model('TransactionAudit', TransactionAuditSchema);
