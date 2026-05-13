import apiClient from '../apiClient';

export const buildTemplatePayload = ({ to, template }) => {
  const parameters = Array.isArray(template?.parameters) ? template.parameters : [];

  return {
    to,
    template_name: template?.name,
    language: template?.language,
    Components: [
      {
        type: 'body',
        parameters: parameters.map((value) => ({
          type: 'text',
          text: String(value ?? ''),
        })),
      },
    ],
  };
};

const getCloudinaryResourceType = ({ type, fileType }) => {
  const normalizedType = String(type || '').toLowerCase();
  const normalizedFileType = String(fileType || '').toLowerCase();

  if (
    normalizedType === 'image' ||
    normalizedType.startsWith('image/') ||
    normalizedFileType.startsWith('image/')
  ) {
    return 'image';
  }

  if (
    normalizedType === 'video' ||
    normalizedType.startsWith('video/') ||
    normalizedFileType.startsWith('video/')
  ) {
    return 'video';
  }

  return 'raw';
};

const AUTO_REPLY_ENDPOINTS = [
  '/api/whatsapp/auto-reply',
  '/api/whatsapp/auto-replies',
  '/api/whatsapp/auto-reply-rules',
];

const tryAutoReplyEndpoints = async (requestFactory) => {
  let lastError = null;

  for (const endpoint of AUTO_REPLY_ENDPOINTS) {
    try {
      const response = await requestFactory(endpoint);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const fetchWhatsAppStatus = () => apiClient.get('/api/whatsapp/status');

export const fetchWhatsAppMessages = () => apiClient.get('/api/whatsapp/messages');

export const fetchWhatsAppTemplates = () => apiClient.get('/api/whatsapp/templates');

export const sendWhatsAppTextMessage = (payload) =>
  apiClient.post('/api/whatsapp/send-text', payload);

export const sendWhatsAppTemplateMessage = (payload) =>
  apiClient.post('/api/whatsapp/send-template', payload);

export const sendWhatsAppFlowMessage = (payload) =>
  apiClient.post('/api/whatsapp/send-flow', payload);

export const sendWhatsAppMediaMessage = (payload) => {
  const isFormData =
    typeof FormData !== 'undefined' && payload instanceof FormData;

  return apiClient.post(
    '/api/whatsapp/send-media',
    payload,
    isFormData
      ? {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      : undefined
  );
};

export const getAutoReplyRules = () =>
  tryAutoReplyEndpoints((endpoint) => apiClient.get(endpoint));

export const createAutoReplyRule = (payload) =>
  tryAutoReplyEndpoints((endpoint) =>
    apiClient.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  );

export const updateAutoReplyRule = (id, payload) =>
  apiClient.put(`/api/whatsapp/auto-reply/${id}`, payload, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const deleteAutoReplyRule = (id) =>
  apiClient.delete(`/api/whatsapp/auto-reply/${id}`);

export const toggleAutoReplyRule = (id) =>
  apiClient.patch(`/api/whatsapp/auto-reply/${id}/toggle`);

export const uploadToCloudinary = async ({ file, type, cloudName, uploadPreset }) => {
  const resolvedCloudName =
    cloudName || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dadcprflr';
  const resolvedUploadPreset =
    uploadPreset ||
    import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ||
    'mern-images';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', resolvedUploadPreset);

  const resourceType = getCloudinaryResourceType({
    type,
    fileType: file?.type,
  });

  const endpoint = `https://api.cloudinary.com/v1_1/${resolvedCloudName}/${resourceType}/upload`;

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  let data = {};
  try {
    data = await response.json();
  } catch (parseError) {
    data = { error: { message: 'Invalid Cloudinary response payload' } };
    console.error('Cloudinary response parse failed:', parseError);
  }

  if (!response.ok) {
    console.error('Cloudinary upload failed:', {
      status: response.status,
      statusText: response.statusText,
      endpoint,
      resourceType,
      fileType: file?.type,
      uploadPreset: resolvedUploadPreset,
      response: data,
    });
    throw new Error(data?.error?.message || 'Cloudinary upload failed.');
  }

  return data?.secure_url || '';
};

export const whatsappCloudService = {
  sendTextMessage: sendWhatsAppTextMessage,
  sendTemplateMessage: sendWhatsAppTemplateMessage,
  sendFlowMessage: sendWhatsAppFlowMessage,
  sendMediaMessage: sendWhatsAppMediaMessage,
  getMessages: fetchWhatsAppMessages,
  getTemplates: fetchWhatsAppTemplates,
  getStatus: fetchWhatsAppStatus,
  getAutoReplyRules,
  createAutoReplyRule,
  updateAutoReplyRule,
  deleteAutoReplyRule,
  toggleAutoReplyRule,
  uploadToCloudinary,
};

export default whatsappCloudService;

// ── Baileys (unofficial WhatsApp Web / QR-based) ─────────────────────────────

export const baileysGetStatus       = ()        => apiClient.get('/api/baileys/status');
export const baileysConnect         = ()        => apiClient.post('/api/baileys/connect');
export const baileysDisconnect      = ()        => apiClient.post('/api/baileys/disconnect');

export const baileysGetInbox        = ()        => apiClient.get('/api/baileys/inbox');
export const baileysGetConversation = (key)     => apiClient.get(`/api/baileys/conversation/${key}`);
export const baileysMarkRead        = (key)     => apiClient.post(`/api/baileys/conversation/${key}/read`);

export const baileysSendText        = (payload) => apiClient.post('/api/baileys/send-text', payload);

export const baileysGetLogs             = ()           => apiClient.get('/api/baileys/logs');

// ── Baileys Group messaging ───────────────────────────────────────────────────
export const baileysGetGroups           = ()           => apiClient.get('/api/baileys/groups');
export const baileysGetGroupInbox       = ()           => apiClient.get('/api/baileys/group-inbox');
export const baileysGetGroupConversation = (groupId)  => apiClient.get(`/api/baileys/group-conversation/${encodeURIComponent(groupId)}`);
export const baileysGroupMarkRead       = (groupId)   => apiClient.post(`/api/baileys/group-conversation/${encodeURIComponent(groupId)}/read`);

export const getWhatsAppProvider    = ()        => apiClient.get('/api/baileys/provider');
export const updateWhatsAppProvider = (p)       => apiClient.put('/api/baileys/provider', { provider: p });

export const baileysService = {
  getStatus:       baileysGetStatus,
  connect:         baileysConnect,
  disconnect:      baileysDisconnect,
  getInbox:        baileysGetInbox,
  getConversation: baileysGetConversation,
  markRead:        baileysMarkRead,
  sendText:        baileysSendText,
  getLogs:         baileysGetLogs,
  getProvider:     getWhatsAppProvider,
  setProvider:     updateWhatsAppProvider,
};