import axios from '../apiClient.js';

export const fetchPriorities = () => axios.get('/api/priority/GetPriorityList');
export const deletePriority = (priorityId) => axios.delete(`/priority/DeletePriority/${priorityId}`);
export const fetchPriorityById = (priorityId) => axios.get(`/priority/${priorityId}`);
export const updatePriority = (priorityId, payload) => axios.put(`/priority/update/${priorityId}`, payload);
