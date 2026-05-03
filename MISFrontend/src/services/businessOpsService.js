import axios from '../apiClient.js';

const unwrap = (response) => response?.data?.result ?? response?.data ?? {};

const base = '/api/business-control';

export const getBusinessControlSummary = async () => unwrap(await axios.get(`${base}/summary`));
export const createQuickOrderWorkflow = async (payload) => unwrap(await axios.post(`${base}/orders/quick`, payload));
export const moveOrderStage = async (orderUuid, payload) => unwrap(await axios.post(`${base}/orders/${orderUuid}/stage`, payload));
export const markOrderReady = async (orderUuid, payload = {}) => unwrap(await axios.post(`${base}/orders/${orderUuid}/ready`, payload));
export const markOrderDelivered = async (orderUuid, payload = {}) => unwrap(await axios.post(`${base}/orders/${orderUuid}/delivered`, payload));
export const receiveOrderPayment = async (orderUuid, payload) => unwrap(await axios.post(`${base}/orders/${orderUuid}/payment`, payload));
export const assignVendorToOrder = async (orderUuid, payload) => unwrap(await axios.post(`${base}/orders/${orderUuid}/vendor`, payload));
export const payVendor = async (vendorId, payload) => unwrap(await axios.post(`${base}/vendors/${vendorId}/payment`, payload));
