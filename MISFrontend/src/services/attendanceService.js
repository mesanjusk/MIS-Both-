import axios from '../apiClient.js';

export const fetchAttendanceList = () => axios.get('/api/attendance/GetAttendanceList');
export const addAttendance = (payload) => axios.post('/api/attendance/addAttendance', payload);

export const fetchAttendanceDevices = () => axios.get('/api/attendance-devices');
export const registerAttendanceDevice = (payload) => axios.post('/api/attendance-devices', payload);
export const updateAttendanceDevice = (deviceUuid, payload) =>
  axios.put(`/api/attendance-devices/${deviceUuid}`, payload);
export const rotateAttendanceDeviceKey = (deviceUuid) =>
  axios.post(`/api/attendance-devices/${deviceUuid}/rotate-key`);

export const fetchAttendanceDeviceEmployeeMappings = () =>
  axios.get('/api/attendance-devices/employee-mappings');
export const updateAttendanceDeviceEmployeeMapping = (userUuid, employeeId) =>
  axios.put(`/api/attendance-devices/employee-mappings/${userUuid}`, { employeeId });
