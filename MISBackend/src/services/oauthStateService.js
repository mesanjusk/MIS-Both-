/**
 * Issue and redeem the `state` parameter for OAuth authorization flows.
 *
 * Two properties matter and neither held before:
 *
 *   - A state exists only because an authorized user started the flow, so a
 *     callback cannot connect (or replace) an integration on its own. Drive's
 *     connect endpoint was public, which meant anyone who could complete Google
 *     consent for this OAuth client could overwrite the configured connection.
 *
 *   - A state is redeemable once. The redemption is a single atomic
 *     findOneAndDelete, so a replayed callback finds nothing.
 *
 * The acting user and the post-connect redirect both come from the stored row,
 * never from the callback's query string.
 */
const crypto = require('crypto');
const OAuthState = require('../repositories/oauthState');
const logger = require('../utils/logger');

// Long enough to complete a consent screen, short enough to limit replay.
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Create a state row and return the opaque nonce to hand the provider.
 *
 * @param {object} params
 * @param {string} params.purpose   flow identifier, e.g. 'google_drive'
 * @param {object} [params.user]    the authenticated initiator (req.user)
 * @param {string} [params.returnTo] already-validated redirect target
 * @param {object} [params.meta]    flow-specific extras
 * @returns {Promise<string>} the nonce
 */
async function createState({ purpose, user, returnTo = '', meta = null }) {
  if (!purpose) throw new Error('OAuth state requires a purpose');

  const nonce = crypto.randomBytes(32).toString('base64url');

  await OAuthState.create({
    nonce,
    purpose,
    user_id:   String(user?.id || ''),
    user_name: String(user?.userName || user?.User_name || ''),
    return_to: returnTo || '',
    meta,
    expires_at: new Date(Date.now() + STATE_TTL_MS),
  });

  return nonce;
}

/**
 * Redeem a state exactly once.
 *
 * @param {string} nonce    the `state` value the provider sent back
 * @param {string} purpose  the flow it must belong to
 * @returns {Promise<object|null>} the stored row, or null when the state is
 *   unknown, already used, issued for another flow, or expired
 */
async function consumeState(nonce, purpose) {
  if (!nonce || !purpose) return null;

  // Atomic: two concurrent redemptions cannot both succeed.
  const state = await OAuthState.findOneAndDelete({ nonce: String(nonce), purpose }).lean();

  if (!state) {
    logger.warn({ purpose }, 'OAuth callback presented an unknown or already-used state');
    return null;
  }

  // Checked here rather than left to the TTL index, which is only a sweeper and
  // is not guaranteed to exist on a deployed database.
  if (state.expires_at && state.expires_at.getTime() < Date.now()) {
    logger.warn({ purpose }, 'OAuth callback presented an expired state');
    return null;
  }

  return state;
}

module.exports = { createState, consumeState, STATE_TTL_MS };
