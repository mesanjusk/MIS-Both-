import axios from '../apiClient.js';

const root = '/api/itemgroup/rate-categories';
const unwrap = response => response?.data?.result ?? response?.data ?? null;

export const fetchRateCategories = async () => unwrap(await axios.get(root));
export const createRateCategory = async name => unwrap(await axios.post(root, { name }));
export const renameRateCategory = async (uuid, name) =>
  unwrap(await axios.put(root + '/' + encodeURIComponent(uuid), { name }));
export const deleteRateCategory = async uuid =>
  unwrap(await axios.delete(root + '/' + encodeURIComponent(uuid)));
