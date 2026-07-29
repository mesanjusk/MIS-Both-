const { sendMessage } = require('./metaApiService');

const norm = (v) => String(v || '').replace(/\D/g, '');

async function sendWhatsAppText({ to, body }) {
  const toClean = norm(to);

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
