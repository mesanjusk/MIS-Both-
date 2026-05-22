/**
 * Helper to read/write the WhatsApp provider setting from AppSetting collection.
 * Key: 'whatsapp_provider'  Values: 'official' | 'baileys'
 */
const { AppSetting } = require('../repositories/appSetting');

const PROVIDER_KEY     = 'whatsapp_provider';
const DEFAULT_PROVIDER = 'baileys';

async function getWhatsAppProvider() {
  try {
    const val = await AppSetting.getSetting(PROVIDER_KEY, DEFAULT_PROVIDER);
    return String(val || DEFAULT_PROVIDER);
  } catch {
    return DEFAULT_PROVIDER;
  }
}

async function setWhatsAppProvider(provider) {
  const allowed = ['official', 'baileys'];
  if (!allowed.includes(provider)) {
    throw new Error(`Invalid provider "${provider}". Must be one of: ${allowed.join(', ')}`);
  }
  return AppSetting.upsertSetting({
    key: PROVIDER_KEY,
    value: provider,
    description: 'Controls which WhatsApp API is used: "official" (Meta Cloud API) or "baileys" (WhatsApp Web / QR-based)',
  });
}

module.exports = { getWhatsAppProvider, setWhatsAppProvider, PROVIDER_KEY };
