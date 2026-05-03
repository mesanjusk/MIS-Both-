import axios from '../apiClient.js';

export const fetchAttendanceList = () => axios.get('/api/attendance/GetAttendanceList');
export const addAttendance = (payload) => axios.post('/api/attendance/addAttendance', payload);
