const mongoose = require('mongoose');

/**
 * Server-issued, single-use state for an OAuth authorization round trip.
 *
 * The providers' `state` parameter used to be an unsigned base64 blob built by
 * the client — for Drive it was just a return URL — so nothing tied a callback
 * to an authorization someone was actually allowed to start. A row here is
 * created only when an authorized user begins the flow, and consumed exactly
 * once when the provider calls back.
 */
const OAuthStateSchema = new mongoose.Schema(
  {
    // The opaque value handed to the provider as `state`.
    nonce: { type: String, required: true, unique: true, index: true },

    // Which flow this belongs to; a state issued for one provider must not be
    // redeemable at another's callback.
    purpose: { type: String, required: true },

    // Who started the flow, so the callback acts as them rather than as
    // whoever the callback claims to be.
    user_id:   { type: String, default: '' },
    user_name: { type: String, default: '' },

    // Validated at issue time, so the callback never redirects somewhere the
    // caller chose at redemption time.
    return_to: { type: String, default: '' },

    // Flow-specific extras (e.g. which social provider is being connected).
    meta: { type: mongoose.Schema.Types.Mixed, default: null },

    expires_at: { type: Date, required: true },
  },
  { versionKey: false, timestamps: true }
);

// Cleanup only — consumeState checks expiry itself, so a missing TTL index
// (production runs with autoIndex off) cannot make an expired state usable.
OAuthStateSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.OAuthState || mongoose.model('OAuthState', OAuthStateSchema);
