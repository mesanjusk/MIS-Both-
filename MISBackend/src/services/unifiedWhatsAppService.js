const { sendMessage } = require('./metaApiService');
const sanjusk = require('./sanjuskApiService');
const logger = require('../utils/logger');

const norm = (v) => String(v || '').replace(/\D/g, '');

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
async function sendWhatsAppText({ to, body }) {
  const toClean = norm(to);

  if (await sanjusk.isEnabled()) {
    const result = await sanjusk.sendText({ phone: toClean, text: body });
    logger.info({ to: toClean, provider: 'sanjusk' }, '[whatsapp] text sent');
    return result;
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN   || process.env.META_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp env credentials missing (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)');
  }
  return sendMessage({
    phoneNumberId,
    accessToken,
    payload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toClean,
      type: 'text',
      text: { preview_url: false, body },
    },
  });
}

module.exports = { sendWhatsAppText };
