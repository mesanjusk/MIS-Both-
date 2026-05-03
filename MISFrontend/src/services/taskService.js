import axios from '../apiClient.js';

export const fetchTaskGroups = () => axios.get('/api/taskgroup/GetTaskgroupList');
export const addTask = (payload) => axios.post('/api/tasks/addTask', payload);
export const fetchTaskById = (taskId) => axios.get(`/tasks/${taskId}`);
export const updateTask = (taskId, payload) => axios.put(`/tasks/update/${taskId}`, payload);
export const fetchTasks = () => axios.get('/api/tasks/GetTaskList');
export const deleteTask = (taskId) => axios.delete(`/tasks/Delete/${taskId}`);
