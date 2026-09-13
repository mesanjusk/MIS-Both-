const sanjusk = require('./sanjuskApiService');
const Message = require('../repositories/Message');
const { emitNewMessage } = require('../socket');
const logger = require('../utils/logger');

const norm = (v) => String(v || '').replace(/\D/g, '');

const extractSanjuskMessageId = (data) =>
  data?.messages?.[0]?.id ||
  data?.data?.messages?.[0]?.id ||
  data?.messageId ||
  data?.id ||
  '';

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
 * One outbound text, sent by whichever provider is configured.
 *
 * Two paths, and the choice is a single stored flag:
 *
 *   SanjuSK   POST {baseUrl}/api/v1/send-text with the account's API key.
 *             Credentials, the 24-hour window and template handling are the
 *             provider's problem, which is the point of using one.
 *   Direct    Meta's Graph API with WHATSAPP_ACCESS_TOKEN, exactly as before.
 *
 * Direct remains the default and is untouched. Nothing changes until an
 * administrator saves a key under Admin → API and turns the integration on,
 * and turning it back off restores the previous behaviour with no code
 * change — which is the property that makes this safe to ship while MIS is
 * already sending real messages.
 *
 * A failure to resolve the provider is never allowed to become a silent
 * fallback to the other one: if SanjuSK is on and its call fails, that error
 * propagates. Quietly sending through a different provider than the one an
 * administrator selected would make delivery problems undiagnosable.
 */
async function sendWhatsAppText({ to, body, source = '' }) {
  const toClean = norm(to);

  // All outbound — automation included — goes through the one SanjuSK account
  // (meta.sanjusk.in) the Home → Inbox uses. Direct Meta sending has been
  // retired: there is no fallback, so a missing SanjuSK key is a hard error
  // rather than a silent switch to a second provider. The Meta WhatsApp
  // credentials are no longer used.
  if (!(await sanjusk.isConfigured())) {
    throw new Error(
      'WhatsApp sending is not configured: save a SanjuSK API key under Admin → API.'
    );
  }

  const result = await sanjusk.sendText({ phone: toClean, text: body, requireEnabled: false });
  logger.info({ to: toClean, provider: 'sanjusk', source: source || '' }, '[whatsapp] text sent');

  await recordOutboundMessage({
    to: toClean,
    body,
    source,
    messageId: extractSanjuskMessageId(result),
  });

  return result;
}

module.exports = { sendWhatsAppText };
