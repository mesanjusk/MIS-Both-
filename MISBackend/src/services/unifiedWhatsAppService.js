const { getWhatsAppProvider } = require('./whatsappProviderSetting');
const baileysService = require('./baileysService');
const { sendMessage } = require('./metaApiService');
const BaileysMessage = require('../repositories/BaileysMessage');
const { emitNewMessage } = require('../../socket');
const logger = require('../utils/logger');

const norm = (v) => String(v || '').replace(/\D/g, '');

async function sendWhatsAppText({ to, body, source = 'SYSTEM', contactName = '' }) {
  const provider = await getWhatsAppProvider();
  const toClean = norm(to);

  if (provider === 'baileys') {
    const result = await baileysService.sendText({ to: toClean, body });
    const log = await BaileysMessage.create({
      to: toClean,
      from: '',
      contactName,
      conversationKey: toClean,
      baileysMessageId: result?.key?.id || '',
      direction: 'OUTGOING',
      source,
      messageType: 'TEXT',
      bodyText: body,
      status: 'SENT',
      meta: result || {},
    });
    try { emitNewMessage({ provider: 'baileys', event: 'new_message', message: log }); } catch (_) {}
    return result;
  }

  // official Meta Cloud API path
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
