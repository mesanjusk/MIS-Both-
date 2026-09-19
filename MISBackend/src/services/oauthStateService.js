/**
 * Issue and redeem the `state` parameter for OAuth authorization flows.
 *
 * New states are stored on the authenticated user's existing Users document.
 * That preserves the two security properties we need:
 *   - only an authenticated/authorized flow starter can mint state
 *   - redemption atomically removes the state, so it can be used once
 *
 * Keeping state on Users also avoids creating another Mongo collection. That
 * is important in deployments that have reached their provider collection cap.
 *
 * Legacy OAuthState rows are still accepted for a short transition window so
 * an authorization flow that started immediately before deployment can finish.
 */
const crypto = require('crypto');
const Users = require('../repositories/users');
const OAuthState = require('../repositories/oauthState');
const logger = require('../utils/logger');

const STATE_TTL_MS = 10 * 60 * 1000;
const USER_STATE_PREFIX = 'u1';

const encodeUserId = (value) => Buffer.from(String(value), 'utf8').toString('base64url');
const decodeUserId = (value) => {
  try {
    return Buffer.from(String(value), 'base64url').toString('utf8');
  } catch {
    return '';
  }
};

async function createState({ purpose, user, returnTo = '', meta = null }) {
  if (!purpose) throw new Error('OAuth state requires a purpose');

  const userId = String(user?.id || user?._id || user?.userId || '');
  if (!userId) throw new Error('OAuth state requires an authenticated user');

  const nonce = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  const result = await Users.updateOne(
    { _id: userId },
    {
      $push: {
        OAuth_states: {
          $each: [{
            nonce,
            purpose,
            user_name: String(user?.userName || user?.User_name || ''),
            return_to: returnTo || '',
            meta,
            expires_at: expiresAt,
          }],
          // Bound storage even if a user repeatedly abandons consent screens.
          $slice: -20,
        },
      },
    }
  );

  if (!result?.matchedCount) {
    throw new Error('Unable to issue OAuth state for the current user');
  }

  return `${USER_STATE_PREFIX}.${encodeUserId(userId)}.${nonce}`;
}

async function consumeUserState(stateToken, purpose) {
  const parts = String(stateToken).split('.');
  if (parts.length !== 3 || parts[0] !== USER_STATE_PREFIX) return null;

  const userId = decodeUserId(parts[1]);
  const nonce = parts[2];
  if (!userId || !nonce) return null;

  // Query + removal happen in one findOneAndUpdate. Concurrent callbacks cannot
  // both match the same array element because the first call removes it.
  const user = await Users.findOneAndUpdate(
    {
      _id: userId,
      OAuth_states: { $elemMatch: { nonce, purpose } },
    },
    {
      $pull: { OAuth_states: { nonce, purpose } },
    },
    {
      new: false,
      projection: { OAuth_states: 1 },
    }
  ).lean();

  if (!user) {
    logger.warn({ purpose }, 'OAuth callback presented an unknown or already-used user-backed state');
    return null;
  }

  const stored = (user.OAuth_states || []).find(
    (item) => item?.nonce === nonce && item?.purpose === purpose
  );

  if (!stored) return null;

  if (stored.expires_at && new Date(stored.expires_at).getTime() < Date.now()) {
    logger.warn({ purpose }, 'OAuth callback presented an expired state');
    return null;
  }

  return {
    nonce,
    purpose,
    user_id: userId,
    user_name: stored.user_name || '',
    return_to: stored.return_to || '',
    meta: stored.meta ?? null,
    expires_at: stored.expires_at,
  };
}

async function consumeLegacyState(nonce, purpose) {
  const state = await OAuthState.findOneAndDelete({ nonce: String(nonce), purpose }).lean();

  if (!state) {
    logger.warn({ purpose }, 'OAuth callback presented an unknown or already-used legacy state');
    return null;
  }

  if (state.expires_at && state.expires_at.getTime() < Date.now()) {
    logger.warn({ purpose }, 'OAuth callback presented an expired legacy state');
    return null;
  }

  return state;
}

async function consumeState(nonce, purpose) {
  if (!nonce || !purpose) return null;

  if (String(nonce).startsWith(`${USER_STATE_PREFIX}.`)) {
    return consumeUserState(nonce, purpose);
  }

  return consumeLegacyState(nonce, purpose);
}

module.exports = { createState, consumeState, STATE_TTL_MS };
