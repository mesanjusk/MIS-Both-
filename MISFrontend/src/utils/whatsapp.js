import {
  DEFAULT_TEMPLATE_LANGUAGE,
  TEMPLATE_VARIABLE_COUNTS,
  buildTemplateBodyParameters,
} from '../constants/whatsappTemplates';

const ADMIN_ALERT_PHONE = '919372333633';

export const extractPhoneNumber = (data = {}) => {
  if (!data || typeof data !== 'object') return '';

  return (
    data?.Mobile_number ||
    data?.mobile ||
    data?.phone ||
    data?.Phone ||
    data?.User_mobile ||
    data?.mobile_number ||
    data?.Mobile ||
    data?.contact ||
    data?.Contact ||
    data?.WhatsApp_number ||
    data?.whatsapp_number ||
    data?.whatsapp ||
    data?.whatsappNumber ||
    data?.Whatsapp_no ||
    data?.customer_mobile ||
    data?.Customer_mobile ||
    ''
  );
};

export const normalizeWhatsAppPhone = (phone) => {
  let cleanPhone = String(phone || '').replace(/\D/g, '');

  if (!cleanPhone) return '';

  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  if (cleanPhone.length > 12 && cleanPhone.startsWith('91')) {
    cleanPhone = cleanPhone.slice(0, 12);
  }

  return cleanPhone;
};

export const resolveWhatsAppPhone = (...sources) => {
  for (const source of sources) {
    if (!source) continue;

    if (typeof source === 'string' || typeof source === 'number') {
      const normalized = normalizeWhatsAppPhone(source);
      if (normalized) return normalized;
      continue;
    }

    const extracted = extractPhoneNumber(source);
    const normalized = normalizeWhatsAppPhone(extracted);
    if (normalized) return normalized;
  }

  return '';
};

export const sendWhatsAppText = async ({ axiosInstance, phone, message }) => {
  const cleanPhone = resolveWhatsAppPhone(phone);

  if (!cleanPhone) {
    throw new Error('Customer phone number is required');
  }

  return axiosInstance.post('/api/whatsapp/send-text', {
    to: cleanPhone,
    body: String(message || '').trim(),
  });
};

export const sendTemplateMessage = async ({
  axiosInstance,
  phone,
  templateName,
  language = DEFAULT_TEMPLATE_LANGUAGE,
  bodyParameters = [],
}) => {
  const cleanPhone = resolveWhatsAppPhone(phone);

  if (!cleanPhone) {
    throw new Error('Customer phone number is required');
  }

  const expectedCount =
    TEMPLATE_VARIABLE_COUNTS?.[templateName] ?? bodyParameters.length;

  const values = Array.isArray(bodyParameters)
    ? bodyParameters
        .slice(0, expectedCount)
        .map((item) => (item == null ? '-' : String(item).trim() || '-'))
    : [];

  while (values.length < expectedCount) {
    values.push('-');
  }

  const payload = {
    to: cleanPhone,
    template_name: templateName,
    language,
    components: [
      {
        type: 'body',
        parameters: buildTemplateBodyParameters(templateName, values),
      },
    ],
  };

  return axiosInstance.post('/api/whatsapp/send-template', payload);
};

export const sendTemplateWithTextFallback = async ({
  axiosInstance,
  phone,
  templateName,
  language = DEFAULT_TEMPLATE_LANGUAGE,
  bodyParameters = [],
  fallbackMessage = '',
}) => {
  try {
    return await sendTemplateMessage({
      axiosInstance,
      phone,
      templateName,
      language,
      bodyParameters,
    });
  } catch (error) {
    if (fallbackMessage) {
      try {
        return await sendWhatsAppText({
          axiosInstance,
          phone,
          message: fallbackMessage,
        });
      } catch {
        throw error;
      }
    }

    throw error;
  }
};

export const sendAdminAlertText = async ({
  axiosInstance,
  message,
  phone = ADMIN_ALERT_PHONE,
}) => {
  if (!message) return null;

  try {
    return await sendWhatsAppText({
      axiosInstance,
      phone,
      message,
    });
  } catch {
    return null;
  }
};