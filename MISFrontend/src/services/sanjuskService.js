import apiClient from '../apiClient';

/**
 * Admin → API: the SanjuSK WhatsApp integration.
 *
 * Every call goes through the MIS backend rather than to meta.sanjusk.in
 * directly. That is deliberate: the API key is a live sending credential, so
 * it is stored encrypted on the server and never reaches the browser. A
 * front-end that talked to SanjuSK itself would have to hold the key in
 * JavaScript, where anyone with the page open can read it.
 */
export const fetchSanjuskConfig = () => apiClient.get('/api/sanjusk/config');

export const saveSanjuskConfig = (payload) => apiClient.put('/api/sanjusk/config', payload);

export const clearSanjuskKey = () => apiClient.delete('/api/sanjusk/config/key');

/** Proves the saved key works, and names the number it sends from. */
export const testSanjuskConnection = () => apiClient.post('/api/sanjusk/test');

export const fetchSanjuskTemplates = () => apiClient.get('/api/sanjusk/templates');

export const fetchSanjuskMessages = (params = {}) =>
  apiClient.get('/api/sanjusk/messages', { params });

export const sendSanjuskTestMessage = (payload) => apiClient.post('/api/sanjusk/send-test', payload);
