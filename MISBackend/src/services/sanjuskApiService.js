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

/** The shape safe to hand a browser: no key, only enough to identify it. */
const toPublicConfig = (config) => ({
  baseUrl: config.baseUrl || DEFAULT_BASE_URL,
  enabled: Boolean(config.enabled),
  hasApiKey: Boolean(config.apiKeyEncrypted),
  keyPrefix: config.keyPrefix || '',
  updatedAt: config.updatedAt || null,
  updatedBy: config.updatedBy || '',
});

const getPublicConfig = async () => toPublicConfig(await loadRawConfig());

/**
 * Saves the configuration. An absent or blank apiKey leaves the stored key
 * alone rather than clearing it — the UI never receives the key, so it cannot
 * send it back, and treating "field left empty" as "delete the credential"
 * would wipe the integration every time someone edited the base URL.
 * Clearing is explicit, via clearApiKey().
 */
const saveConfig = async ({ baseUrl, apiKey, enabled, updatedBy }) => {
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

  if (enabled !== undefined) next.enabled = Boolean(enabled);

  if (next.enabled && !next.apiKeyEncrypted) {
    throw new AppError('Save an API key before turning the integration on.', 400);
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
    // A configuration with no key cannot send, so leaving it enabled would
    // only produce confusing failures at send time.
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
    // A changed WHATSAPP_TOKEN_ENCRYPTION_KEY is the usual cause, and it is
    // worth saying so: the stored value is not recoverable, it must be
    // re-entered.
    logger.error({ err: error.message }, '[sanjusk] stored API key could not be decrypted');
    throw new AppError(
      'The saved API key could not be decrypted — the encryption key has changed. Re-enter the API key under Admin → API.',
      500
    );
  }

  return { baseUrl: config.baseUrl || DEFAULT_BASE_URL, apiKey };
};

/**
 * One place where a failed call becomes a message a human can act on.
 *
 * The SanjuSK API answers errors as {success:false, message, code}. Passing
 * that through matters most for OUTSIDE_24H_WINDOW, which is not a fault —
 * it means the reply must be a template — and callers need to distinguish it
 * from an outage.
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

/**
 * Recent messages, oldest first. Used by the admin screen to show that
 * inbound is actually arriving; the live inbound path is the webhook, not
 * this.
 */
const listMessages = ({ since, direction, phone, limit = 25, requireEnabled = true } = {}) => {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (direction) params.set('direction', direction);
  if (phone) params.set('phone', phone);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return request({ method: 'get', path: `/messages${query ? `?${query}` : ''}`, requireEnabled });
};

/** True when sending should go through SanjuSK rather than direct to Meta. */
const isEnabled = async () => {
  const config = await loadRawConfig();
  return Boolean(config.enabled && config.apiKeyEncrypted);
};

module.exports = {
  SETTING_KEY,
  DEFAULT_BASE_URL,
  getPublicConfig,
  saveConfig,
  clearApiKey,
  getStatus,
  listTemplates,
  listMessages,
  sendText,
  sendTemplate,
  sendMedia,
  isEnabled,
};
