import axios from '../apiClient.js';

export const fetchSessions = () => axios.get('/api/whatsapp/sessions');
export const sendTestMessage = (payload) => axios.post('/api/whatsapp/send-test', payload);
export const resetSession = (sessionId) => axios.post('/api/whatsapp/reset-session', { sessionId });
export const startSession = (sessionId) => axios.post('/api/whatsapp/start-session', { sessionId });
export const fetchSessionQr = (sessionId) => axios.get(`/whatsapp/session/${sessionId}/qr`);

// Chat operations
export const fetchWhatsAppStatus = () => axios.get('/api/whatsapp/accounts');
export const fetchChatList = () => axios.get('/api/chatlist');
export const fetchCustomers = () => axios.get('/api/customers/GetCustomersList');
export const fetchMessagesByNumber = (number) => axios.get(`/messages/${number}`);
export const fetchCustomerByNumber = (number) => axios.get(`/api/customers/by-number/${number}`);
export const sendWhatsAppMessage = (payload) =>
  axios.post('/api/whatsapp/send-text', {
    to: payload?.to || payload?.number || payload?.phone || '',
    text: payload?.text || payload?.message || payload?.body || '',
  });
