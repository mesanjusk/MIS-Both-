import axios from '../apiClient.js';

const base = '/api/rate-cards';
const unwrap = (r) => r?.data?.result ?? r?.data ?? {};

export const fetchRateCards = async (activeOnly = false) => {
  const r = await axios.get(base, { params: activeOnly ? { active: 'true' } : {} });
  return unwrap(r);
};

export const fetchRateCard = async (id) => unwrap(await axios.get(`${base}/${id}`));

export const createRateCard = async (payload) => unwrap(await axios.post(base, payload));

export const updateRateCard = async (id, payload) => unwrap(await axios.put(`${base}/${id}`, payload));

export const deleteRateCard = async (id) => unwrap(await axios.delete(`${base}/${id}`));
