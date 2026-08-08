// Thin wrapper around utils/crypto.js (AES-256-GCM) pinned to the
// Social Media module's own key, per CLAUDE.md instructions:
// "If an encryption helper already exists, reuse it." Access/refresh tokens
// must never be stored in plaintext and must never round-trip through the
// normal API response — see repositories/SocialAccount.js toSafeJSON().
const { encrypt, decrypt } = require('../../utils/crypto');

const KEY_ENV_VAR = 'SOCIAL_TOKEN_ENCRYPTION_KEY';

const encryptToken = (value) => (value ? encrypt(value, KEY_ENV_VAR) : null);
const decryptToken = (value) => (value ? decrypt(value, KEY_ENV_VAR) : null);

module.exports = { encryptToken, decryptToken };
