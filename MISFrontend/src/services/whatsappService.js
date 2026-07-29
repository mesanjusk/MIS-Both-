import axios from '../apiClient.js';

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
