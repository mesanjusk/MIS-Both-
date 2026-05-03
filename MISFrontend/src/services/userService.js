import axios from '../apiClient.js';

export const fetchUsers = () => axios.get('/api/users/GetUserList');
export const deleteUser = (userUuid) => axios.delete(`/api/users/DeleteUser/${userUuid}`);
