import axios from '../apiClient.js';

export const addNote = (payload) => axios.post('/api/note/addNote', payload);
