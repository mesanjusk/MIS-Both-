import axios, { getApiBase } from '../apiClient';

export function createUpiPaymentAttempt(payload) {
  return axios.post('/api/upi/payments/attempt', payload);
}

export function listUpiPaymentAttempts(params = {}) {
  return axios.get('/api/upi/payments', { params });
}

export function getUpiPaymentAttemptById(attemptId) {
  return axios.get(`/api/upi/payments/${attemptId}`);
}

export function getUpiPaymentAttemptByTxnRef(transactionRef) {
  return axios.get(`/api/upi/payments/tx/${transactionRef}`);
}

export function updateUpiPaymentAttemptStatus(attemptId, payload) {
  return axios.patch(`/api/upi/payments/${attemptId}/status`, payload);
}

export function getPublicUpiPaymentAttempt(transactionRef) {
  return fetch(`${getApiBase()}/api/upi/public/${encodeURIComponent(transactionRef)}`)
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to load payment request');
      }
      return data;
    });
}
