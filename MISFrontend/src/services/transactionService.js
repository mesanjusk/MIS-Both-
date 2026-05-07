import axios from '../apiClient.js';

export const fetchTransactions = () => axios.get('/api/transaction');
export const addTransaction = (payload, config) => axios.post('/api/transaction/addTransaction', payload, config);
// Update and delete use Transaction_uuid (not Transaction_id) — matches PUT/DELETE /api/transaction/:uuid
export const updateTransaction = (transactionUuid, payload) => axios.put(`/api/transaction/${transactionUuid}`, payload);
export const deleteTransactionById = (transactionUuid) => axios.delete(`/api/transaction/${transactionUuid}`);
export const sendTaskMessage = (payload) => axios.post('/api/usertasks/send-message', payload);
