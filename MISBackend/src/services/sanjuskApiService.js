const axios = require('axios');
const { AppSetting } = require('../repositories/appSetting');
const { encrypt, decrypt } = require('../utils/crypto');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Client for the SanjuSK WhatsApp API (https://meta.sanjusk.in/api/v1).
 *
 * MIS already receives inbound messages from SanjuSK — see
 * controllers/whatsappController.js's metabspWebhookReceive, which verifies
 * the X-Metabsp-Signature-256 header and feeds the message into the normal
 * inbound pipeline. What was missing is the other direction: sending. Until
 * now MIS talked to Meta's Graph API directly with WHATSAPP_ACCESS_TOKEN
 * (services/unifiedWhatsAppService.js), which means credentials, the 24-hour
 * window and template handling all live here rather than with the provider
 * that already manages them.
 *
 * This is deliberately additive. The direct-Meta path is untouched and stays
 * the default; nothing routes through SanjuSK until an administrator saves a
 * key and turns it on, and turning it off restores the previous behaviour
 * exactly. Ripping out a working send path to prove a new one is not a trade
 * worth making.
 *
 * The API key is a live sending credential: anyone holding it can send
 * WhatsApp messages as this business. It is stored encrypted with the same
 * AES-256-GCM helper the WhatsApp tokens use, and never leaves the server —
 * the config endpoint returns a masked prefix so the UI can show *which* key
 * is saved without being able to use it.
 */
const SETTING_KEY = 'sanjusk_api';
const DEFAULT_BASE_URL = 'https://meta.sanjusk.in';
const REQUEST_TIMEOUT_MS = 20000;

const emptyConfig = () => ({
  baseUrl: DEFAULT_BASE_URL,
  apiKeyEncrypted: '',
  keyPrefix: '',
  webhookSecretEncrypted: '',
  enabled: false,
  updatedAt: null,
  updatedBy: '',
});

/** Trailing slashes make `${base}/api/v1/...` produce a double slash. */
const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const loadRawConfig = async () => {
  const stored = await AppSetting.getSetting(SETTING_KEY, null);
  return { ...emptyConfig(), ...(stored || {}) };
};

/**
 * Return whether an encrypted credential can still be opened with the current
 * server encryption key. This deliberately never returns the plaintext.
 */
const encryptedValueUsable = (value) => {
  if (!value) return false;
  try {
    return Boolean(decrypt(value));
  } catch {
    return false;
  }
};

/** The shape safe to hand a browser: no secret values are ever returned. */
const toPublicConfig = (config) => {
  const hasApiKey = Boolean(config.apiKeyEncrypted);
  const apiKeyUsable = hasApiKey && encryptedValueUsable(config.apiKeyEncrypted);
  const hasWebhookSecret = Boolean(config.webhookSecretEncrypted);
  const webhookSecretUsable = hasWebhookSecret && encryptedValueUsable(config.webhookSecretEncrypted);

  return {
    baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    enabled: Boolean(config.enabled),
    hasApiKey,
    apiKeyUsable,
    apiKeyNeedsReentry: hasApiKey && !apiKeyUsable,
    keyPrefix: config.keyPrefix || '',
    hasWebhookSecret,
    webhookSecretUsable,
    webhookSecretNeedsReentry: hasWebhookSecret && !webhookSecretUsable,
    updatedAt: config.updatedAt || null,
    updatedBy: config.updatedBy || '',
  };
};

const getPublicConfig = async () => toPublicConfig(await loadRawConfig());

/**
 * Saves the configuration. A new plaintext key/secret is always encrypted with
 * the CURRENT server encryption key, replacing any stale ciphertext. Blank
 * fields keep an existing credential only when that credential is still
 * decryptable. This prevents an old, undecryptable value from silently
 * surviving what looks like a successful configuration update.
 */
const saveConfig = async ({ baseUrl, apiKey, webhookSecret, enabled, updatedBy }) => {
  const current = await loadRawConfig();
  const next = { ...current };

  if (baseUrl !== undefined) {
    const normalized = normalizeBaseUrl(baseUrl) || DEFAULT_BASE_URL;
    if (!/^https:\/\//i.test(normalized)) {
      throw new AppError('The API base URL must start with https://', 400);
    }
    next.baseUrl = normalized;
  }

  const trimmedKey = String(apiKey || '').trim();
  if (trimmedKey) {
    next.apiKeyEncrypted = encrypt(trimmedKey);
    next.keyPrefix = trimmedKey.slice(0, 12);
  }

  if (webhookSecret !== undefined) {
    const trimmedSecret = String(webhookSecret || '').trim();
    if (trimmedSecret) {
      next.webhookSecretEncrypted = encrypt(trimmedSecret);
    }
  }

  if (enabled !== undefined) next.enabled = Boolean(enabled);

  if (next.enabled && !next.apiKeyEncrypted) {
    throw new AppError('Save an API key before turning the integration on.', 400);
  }

  // If the encryption key changed, keeping the old ciphertext is not a valid
  // save. Force a real replacement instead of returning “Saved” while Inbox
  // continues to fail later.
  if (!trimmedKey && next.apiKeyEncrypted && !encryptedValueUsable(next.apiKeyEncrypted)) {
    throw new AppError(
      'The saved SanjuSK API key was encrypted with an older server key. Re-enter the API key to replace it.',
      409
    );
  }

  if (
    webhookSecret !== undefined &&
    !String(webhookSecret || '').trim() &&
    next.webhookSecretEncrypted &&
    !encryptedValueUsable(next.webhookSecretEncrypted)
  ) {
    throw new AppError(
      'The saved webhook secret was encrypted with an older server key. Re-enter the webhook secret to replace it.',
      409
    );
  }

  next.updatedAt = new Date().toISOString();
  next.updatedBy = String(updatedBy || '');

  await AppSetting.upsertSetting({
    key: SETTING_KEY,
    value: next,
    description: 'SanjuSK WhatsApp API connection (key stored encrypted)',
  });

  return toPublicConfig(next);
};

const clearApiKey = async ({ updatedBy } = {}) => {
  const current = await loadRawConfig();
  const next = {
    ...current,
    apiKeyEncrypted: '',
    keyPrefix: '',
    enabled: false,
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || ''),
  };
  await AppSetting.upsertSetting({
    key: SETTING_KEY,
    value: next,
    description: 'SanjuSK WhatsApp API connection (key stored encrypted)',
  });
  return toPublicConfig(next);
};

/**
 * Resolves credentials for an outbound call.
 *
 * `requireEnabled: false` is what the admin screen's "Test connection" uses —
 * you must be able to prove a key works before switching traffic onto it.
 */
const resolveCredentials = async ({ requireEnabled = true } = {}) => {
  const config = await loadRawConfig();

  if (!config.apiKeyEncrypted) {
    throw new AppError('No SanjuSK API key is saved. Add one under Admin → API.', 409);
  }
  if (requireEnabled && !config.enabled) {
    throw new AppError('The SanjuSK integration is turned off.', 409);
  }

  let apiKey;
  try {
    apiKey = decrypt(config.apiKeyEncrypted);
  } catch (error) {
    logger.error({ err: error.message }, '[sanjusk] stored API key could not be decrypted');
    // This is configuration state, not a server crash. Returning 409 also
    // prevents monitoring/UI from reporting it as an unexplained 500.
    throw new AppError(
      'The saved SanjuSK API key was encrypted with an older server key. Re-enter the API key under Admin → API.',
      409
    );
  }

  return { baseUrl: config.baseUrl || DEFAULT_BASE_URL, apiKey };
};

/**
 * One place where a failed call becomes a message a human can act on.
 */
const request = async ({ method, path, body, requireEnabled = true }) => {
  const { baseUrl, apiKey } = await resolveCredentials({ requireEnabled });

  try {
    const response = await axios({
      method,
      url: `${baseUrl}/api/v1${path}`,
      data: body,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data || {};
    const message = data.message || error.message || 'SanjuSK API request failed';

    if (status) {
      const appError = new AppError(message, status === 429 ? 429 : status);
      appError.code = data.code || '';
      throw appError;
    }
    throw new AppError(`Could not reach the SanjuSK API: ${message}`, 502);
  }
};

/** Which number this key sends from. The first call to make. */
const getStatus = ({ requireEnabled = true } = {}) =>
  request({ method: 'get', path: '/status', requireEnabled });

const listTemplates = ({ requireEnabled = true } = {}) =>
  request({ method: 'get', path: '/templates', requireEnabled });

const sendText = ({ phone, text, requireEnabled = true }) =>
  request({ method: 'post', path: '/send-text', body: { phone, text }, requireEnabled });

const sendTemplate = ({ phone, template, language = 'en_US', components = [], requireEnabled = true }) =>
  request({
    method: 'post',
    path: '/send-template',
    body: { phone, template, language, components },
    requireEnabled,
  });

const sendMedia = ({ phone, type = 'image', link, caption = '', filename = '', requireEnabled = true }) =>
  request({
    method: 'post',
    path: '/send-media',
    body: { phone, type, link, caption, filename },
    requireEnabled,
  });

const sendInteractive = ({
  phone,
  type = 'button',
  body,
  buttons = [],
  buttonLabel = 'View',
  sections = [],
  requireEnabled = true,
}) =>
  request({
    method: 'post',
    path: '/send-interactive',
    body: { phone, type, body, buttons, buttonLabel, sections },
    requireEnabled,
  });

/** Recent messages, oldest first. */
const listMessages = ({ since, direction, phone, limit = 25, requireEnabled = true } = {}) => {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (direction) params.set('direction', direction);
  if (phone) params.set('phone', phone);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return request({ method: 'get', path: `/messages${query ? `?${query}` : ''}`, requireEnabled });
};

/** True when the toggle is on AND the stored key is actually usable. */
const isEnabled = async () => {
  const config = await loadRawConfig();
  return Boolean(config.enabled && encryptedValueUsable(config.apiKeyEncrypted));
};

/**
 * True only when the stored SanjuSK API key can be decrypted with the current
 * server key. A stale ciphertext must not hijack outbound routing away from the
 * existing direct-Meta fallback.
 */
const isConfigured = async () => {
  const config = await loadRawConfig();
  return encryptedValueUsable(config.apiKeyEncrypted);
};

/**
 * The inbound webhook signing secret saved from Admin → API, or '' if none is
 * stored/usable. The webhook verifier can then fall back to the env secret.
 */
const getWebhookSecret = async () => {
  const config = await loadRawConfig();
  if (!config.webhookSecretEncrypted) return '';
  try {
    return decrypt(config.webhookSecretEncrypted);
  } catch (error) {
    logger.error({ err: error.message }, '[sanjusk] stored webhook secret could not be decrypted');
    return '';
  }
};

const clearWebhookSecret = async ({ updatedBy } = {}) => {
  const current = await loadRawConfig();
  const next = {
    ...current,
    webhookSecretEncrypted: '',
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || ''),
  };
  await AppSetting.upsertSetting({
    key: SETTING_KEY,
    value: next,
    description: 'SanjuSK WhatsApp API connection (key stored encrypted)',
  });
  return toPublicConfig(next);
};

module.exports = {
  SETTING_KEY,
  DEFAULT_BASE_URL,
  getPublicConfig,
  saveConfig,
  clearApiKey,
  getWebhookSecret,
  clearWebhookSecret,
  getStatus,
  listTemplates,
  listMessages,
  sendText,
  sendTemplate,
  sendMedia,
  sendInteractive,
  isEnabled,
  isConfigured,
};
