import axios from '../apiClient.js';

export const fetchCustomers = () => axios.get('/api/customers/GetCustomersList');
// Masked, display-only view for the Customers Report page — respects the
// admin-configured mobile-number-visibility settings. Do not use this for
// order/WhatsApp/print flows that need the real number; use fetchCustomers.
export const fetchCustomersReport = () => axios.get('/api/customers/GetCustomerReport');
export const fetchCustomerGroups = () => axios.get('/api/customergroup/GetCustomergroupList');
export const addCustomerGroup = (payload) => axios.post('/api/customergroup/addCustomergroup', payload);
export const fetchCustomerById = (customerId) => axios.get(`/api/customers/${customerId}`);
export const updateCustomer = (customerId, payload) => axios.put(`/api/customers/update/${customerId}`, payload);
export const deleteCustomer = (customerId) => axios.delete(`/api/customers/DeleteCustomer/${customerId}`);
export const checkDuplicateCustomer = (name) => axios.get(`/api/customers/checkDuplicateName?name=${name}`);
export const updateCustomerEmail = (uuid, email) => axios.patch(`/api/customers/${uuid}/email`, { email });
