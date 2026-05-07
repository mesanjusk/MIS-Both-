import axios from '../apiClient.js';

// Baileys (QR-based) session management — maps to /api/baileys/*
export const fetchSessions = () => axios.get('/api/baileys/status');
export const sendTestMessage = (payload) => axios.post('/api/baileys/send-text', payload);
export const resetSession = () => axios.post('/api/baileys/disconnect');
export const startSession = () => axios.post('/api/baileys/connect');
export const fetchSessionQr = () => axios.get('/api/baileys/status');

// Chat operations
export const fetchWhatsAppStatus = () => axios.get('/api/whatsapp/accounts');
export const fetchChatList = () => axios.get('/api/chatlist');
export const fetchCustomers = () => axios.get('/api/customers/GetCustomersList');
export const fetchMessagesByNumber = (number) => axios.get(`/api/messages/${number}`);
export const fetchCustomerByNumber = (number) => axios.get(`/api/customer/by-number/${number}`);
export const sendWhatsAppMessage = (payload) =>
  axios.post('/api/whatsapp/send-text', {
    to: payload?.to || payload?.number || payload?.phone || '',
    text: payload?.text || payload?.message || payload?.body || '',
  });
