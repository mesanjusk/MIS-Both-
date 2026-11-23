import axios from '../apiClient.js';

const base = '/api/rate-cards/wedding-cards';
const unwrap = (response) => response?.data?.result ?? response?.data ?? [];

export const fetchWeddingCardRates = async () => unwrap(await axios.get(base));
export const createWeddingCardRate = async (data) => unwrap(await axios.post(base, data));
export const updateWeddingCardRate = async (brand, code, data) =>
  unwrap(await axios.put(`${base}/${encodeURIComponent(brand)}/${encodeURIComponent(code)}`, data));
export const deleteWeddingCardRate = async (brand, code) =>
  unwrap(await axios.delete(`${base}/${encodeURIComponent(brand)}/${encodeURIComponent(code)}`));
