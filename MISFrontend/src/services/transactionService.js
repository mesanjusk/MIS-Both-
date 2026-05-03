import axios from '../apiClient.js';

export const fetchTransactions = () => axios.get('/api/transaction');
export const fetchOldTransactions = () => axios.get('/old-transaction/GetTransactionList');
export const addTransaction = (payload, config) => axios.post('/api/transaction/addTransaction', payload, config);
export const addOldTransaction = (payload, config) => axios.post('/old-transaction/addTransaction', payload, config);
export const updateTransaction = (transactionId, payload) => axios.put(`/transaction/updateTransaction/${transactionId}`, payload);
export const deleteTransactionById = (transactionId) => axios.delete(`/transaction/deleteByTransactionId/${transactionId}`);
export const deleteTransactionEntry = (transactionId, accountId) => axios.delete(`/transaction/deleteEntry/${transactionId}/${accountId}`);
export const sendTaskMessage = (payload) => axios.post('/api/usertasks/send-message', payload);
