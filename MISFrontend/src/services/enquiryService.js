import axios from '../apiClient.js';

export const addEnquiry = (payload) => axios.post('/api/enquiry/addEnquiry', payload);
