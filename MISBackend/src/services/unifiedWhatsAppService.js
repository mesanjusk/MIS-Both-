const crypto = require('crypto');
const sanjusk = require('./sanjuskApiService');
const Message = require('../repositories/Message');
const { emitNewMessage } = require('../socket');
const logger = require('../utils/logger');

const norm = (v) => String(v || '').replace(/\D/g, '');

// Cost-control defaults for automated WhatsApp traffic. This service is the
// shared automation sender; staff-typed Inbox replies use the interactive
// controller path and are deliberately not rate-limited here.
const EXACT_DUPLICATE_TTL_MS = 6 * 60 * 60 * 1000;
const SOURCE_COOLDOWN_MS = {
  // Morning + evening digests used to create two paid outbound messages for
  // the same employee. One useful digest in an 18-hour window is sufficient.
  DAILY_DIGEST: 18 * 60 * 60 * 1000,
  // Protect the owner summary from catch-up/restart duplicates.
  OWNER_SUMMARY: 18 * 60 * 60 * 1000,
};
const MAX_CACHE_ENTRIES = 5000;
const recentExactSends = new Map();
const recentSourceSends = new Map();

const extractSanjuskMessageId = (data) =>
  data?.messages?.[0]?.id ||
  data?.data?.messages?.[0]?.id ||
  data?.messageId ||
  data?.id ||
  '';

function normalizeBody(body) {
  return String(body || '').replace(/\s+/g, ' ').trim();
}

function hashBody(body) {
  return crypto.createHash('sha256').update(normalizeBody(body)).digest('hex').slice(0, 24);
}

function pruneCache(cache, now) {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const entries = [...cache.entries()].sort((a, b) => a[1] - b[1]);
  for (const [key] of entries.slice(0, Math.ceil(entries.length / 4))) cache.delete(key);
  // Also remove obviously stale entries while pruning.
  for (const [key, at] of cache.entries()) {
    if (now - at > 24 * 60 * 60 * 1000) cache.delete(key);
  }
}

function shouldSuppressAutomatedSend({ to, body, source, force = false, now = Date.now() }) {
  if (force) return { suppress: false };

  const cleanBody = normalizeBody(body);
  if (!cleanBody) return { suppress: true, reason: 'empty_body' };

  const exactKey = `${to}|${hashBody(cleanBody)}`;
  const exactAt = recentExactSends.get(exactKey);
  if (exactAt && now - exactAt < EXACT_DUPLICATE_TTL_MS) {
    return { suppress: true, reason: 'exact_duplicate' };
  }

  const sourceKey = String(source || '').trim().toUpperCase();
  const cooldown = SOURCE_COOLDOWN_MS[sourceKey];
  if (cooldown) {
    const sourceRecipientKey = `${to}|${sourceKey}`;
    const sourceAt = recentSourceSends.get(sourceRecipientKey);
    if (sourceAt && now - sourceAt < cooldown) {
      return { suppress: true, reason: 'source_cooldown' };
    }
  }

  return { suppress: false, exactKey, sourceKey };
}

function rememberAutomatedSend({ to, body, source, now = Date.now() }) {
  recentExactSends.set(`${to}|${hashBody(body)}`, now);
  const sourceKey = String(source || '').trim().toUpperCase();
  if (SOURCE_COOLDOWN_MS[sourceKey]) recentSourceSends.set(`${to}|${sourceKey}`, now);
  pruneCache(recentExactSends, now);
  pruneCache(recentSourceSends, now);
}

/**
 * Records an outbound automation message in the Message collection and pushes
 * it to any open inbox, exactly as the interactive dispatchers in
 * whatsappController do for staff-typed replies. Without this, everything sent
 * by a scheduler (digests, delivery notices, proof nudges, attendance) went out
 * over the wire but never appeared in the conversation history, so there was no
 * record that MIS had messaged the customer.
 *
 * `source` (e.g. ORDER_DELIVERED, DAILY_DIGEST) tags which flow produced it.
 * Persistence is best-effort: the message is already delivered by the time we
 * get here, so a failure to log must not turn a successful send into an error.
 */
const recordOutboundMessage = async ({ to, body, source, messageId }) => {
  try {
    const saved = await Message.create({
      fromMe: true,
      from: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      to,
      message: body,
      body,
      text: body,
      timestamp: new Date(),
      time: new Date(),
      status: 'sent',
      direction: 'outgoing',
      type: 'text',
      messageId: messageId || '',
      source: source || '',
    });
    emitNewMessage(saved.toObject());
  } catch (error) {
    logger.error({ err: error.message, to, source: source || '' }, '[whatsapp] failed to record outbound automation message');
  }
};

/**
 * Shared sender for automated WhatsApp traffic.
 *
 * Cost controls are intentionally applied here rather than independently in
 * every scheduler/module so new automation cannot accidentally reintroduce
 * duplicate paid replies. `force: true` is available only for a caller that has
 * a genuine operational reason to send an otherwise duplicate automation.
 */
async function sendWhatsAppText({ to, body, source = '', force = false }) {
  const toClean = norm(to);
  const cleanBody = String(body || '').trim();
  if (!toClean) throw new Error('WhatsApp recipient is required');

  const decision = shouldSuppressAutomatedSend({
    to: toClean,
    body: cleanBody,
    source,
    force,
  });
  if (decision.suppress) {
    logger.info(
      { to: toClean, source: source || '', reason: decision.reason },
      '[whatsapp] automated send suppressed by cost control'
    );
    return { suppressed: true, reason: decision.reason };
  }

  // All outbound automation goes through the one SanjuSK account
  // (meta.sanjusk.in). Direct Meta sending remains retired.
  if (!(await sanjusk.isConfigured())) {
    throw new Error(
      'WhatsApp sending is not configured: save a SanjuSK API key under Admin → API.'
    );
  }

  const result = await sanjusk.sendText({ phone: toClean, text: cleanBody, requireEnabled: false });
  rememberAutomatedSend({ to: toClean, body: cleanBody, source });
  logger.info({ to: toClean, provider: 'sanjusk', source: source || '' }, '[whatsapp] text sent');

  await recordOutboundMessage({
    to: toClean,
    body: cleanBody,
    source,
    messageId: extractSanjuskMessageId(result),
  });

  return result;
}

module.exports = {
  sendWhatsAppText,
  shouldSuppressAutomatedSend,
};
