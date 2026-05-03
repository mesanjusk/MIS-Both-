import axios from '../apiClient.js';

export const fetchCustomers = () => axios.get('/api/customers/GetCustomersList');
export const fetchCustomerGroups = () => axios.get('/api/customergroup/GetCustomergroupList');
export const addCustomerGroup = (payload) => axios.post('/api/customergroup/addCustomergroup', payload);
export const fetchCustomerById = (customerId) => axios.get(`/api/customers/${customerId}`);
export const updateCustomer = (customerId, payload) => axios.put(`/api/customers/update/${customerId}`, payload);
export const deleteCustomer = (customerId) => axios.delete(`/api/customers/DeleteCustomer/${customerId}`);
export const checkDuplicateCustomer = (name) => axios.get(`/api/customers/checkDuplicateName?name=${name}`);
