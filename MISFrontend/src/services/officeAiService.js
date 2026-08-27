import axios from '../apiClient.js';

const BASE = '/api/office-ai';

export const fetchOfficeAiStatus = () => axios.get(`${BASE}/status`);
export const fetchOfficeAiBrief = () => axios.get(`${BASE}/brief`);
export const askOfficeAi = (question) => axios.post(`${BASE}/ask`, { question });
export const parseCustomerEnquiry = (message) => axios.post(`${BASE}/customer/parse`, { message });
export const prepareCustomerQuote = (requirement, rateCardUuid) =>
  axios.post(`${BASE}/customer/quote`, { requirement, rateCardUuid });
