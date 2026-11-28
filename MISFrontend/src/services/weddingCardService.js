import axios from '../apiClient.js';

const base = '/api/rate-cards/wedding-cards';
const unwrap = (response) => response?.data?.result ?? response?.data ?? [];

export const fetchWeddingCardRates = async () => unwrap(await axios.get(base));
export const fetchWeddingCardSubcategories = async () => unwrap(await axios.get(base + '/subcategories'));
export const createWeddingCardSubcategory = async data => unwrap(await axios.post(base + '/subcategories', data));
export const updateWeddingCardSubcategory = async (code, data) =>
  unwrap(await axios.put(base + '/subcategories/' + encodeURIComponent(code), data));
export const deleteWeddingCardSubcategory = async code =>
  unwrap(await axios.delete(base + '/subcategories/' + encodeURIComponent(code)));
export const quoteWeddingCard = async (brand, code, qty, overrides = {}) =>
  unwrap(await axios.get(base + '/quote', { params: { brand, code, qty, ...overrides } }));
export const createWeddingCardRate = async (data) => unwrap(await axios.post(base, data));
export const updateWeddingCardRate = async (brand, code, data) =>
  unwrap(await axios.put(`${base}/${encodeURIComponent(brand)}/${encodeURIComponent(code)}`, data));
export const bulkUpdateWeddingCardRates = async (codes, changes, mode = 'set') =>
  unwrap(await axios.patch(base + '/bulk', { codes, changes, mode }));
export const bulkUpdateWeddingCardRows = async rows =>
  unwrap(await axios.patch(base + '/bulk-rows', { rows }));
export const deleteWeddingCardRate = async (brand, code) =>
  unwrap(await axios.delete(`${base}/${encodeURIComponent(brand)}/${encodeURIComponent(code)}`));
export const uploadWeddingCardPhoto = async (brand, code, file) => {
  const body = new FormData();
  body.append('file', file);
  return unwrap(await axios.post(`${base}/${brand}/${encodeURIComponent(code)}/images`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }));
};
export const removeWeddingCardPhoto = async (brand, code, index) =>
  unwrap(await axios.delete(`${base}/${brand}/${encodeURIComponent(code)}/images/${index}`));
