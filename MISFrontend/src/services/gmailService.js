import axios from '../apiClient';

const BASE = '/api/gmail';

export const getGmailAuthUrl  = ()         => axios.get(`${BASE}/auth-url`).then((r) => r.data);
export const getGmailAccounts = ()         => axios.get(`${BASE}/accounts`).then((r) => r.data);
export const getGmailStats    = ()         => axios.get(`${BASE}/stats`).then((r) => r.data);
export const getEmailHistory  = (params)   => axios.get(`${BASE}/history`, { params }).then((r) => r.data);
export const disconnectAccount = (id)      => axios.delete(`${BASE}/accounts/${id}`).then((r) => r.data);
export const sendEmail = (formData)        =>
  axios.post(`${BASE}/send`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
