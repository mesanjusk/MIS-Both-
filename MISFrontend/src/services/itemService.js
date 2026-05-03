import axios from '../apiClient.js';

export const fetchItems = () => axios.get('/api/items/GetItemList');
export const addItemGroup = (payload) => axios.post('/api/itemgroup/addItemgroup', payload);
export const fetchItemGroups = () => axios.get('/api/itemgroup/GetItemgroupList');
