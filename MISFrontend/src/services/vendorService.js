import axios from '../apiClient.js';

const unwrap = (response) => response?.data?.result ?? response?.data ?? [];

export const addVendor = (payload) => axios.post('/api/vendors/addVendor', payload);

export const fetchVendorMasters = async () => unwrap(await axios.get('/api/vendors/masters'));
export const createVendorMaster = async (payload) => unwrap(await axios.post('/api/vendors/masters', payload));
export const updateVendorMaster = async (vendorUuid, payload) => unwrap(await axios.put(`/vendors/masters/${vendorUuid}`, payload));

export const fetchVendorLedger = async (vendorUuid) => {
  const response = await axios.get(`/vendors/ledger/${vendorUuid}`);
  return {
    entries: response?.data?.result ?? [],
    summary: response?.data?.summary ?? {},
  };
};

export const createVendorLedgerEntry = async (payload) => unwrap(await axios.post('/api/vendors/ledger', payload));
export const fetchProductionJobs = async () => unwrap(await axios.get('/api/vendors/production-jobs'));
export const createProductionJob = async (payload) => unwrap(await axios.post('/api/vendors/production-jobs', payload));
export const fetchStockMovements = async () => unwrap(await axios.get('/api/vendors/stock-movements'));
export const fetchVendorSummary = async () => unwrap(await axios.get('/api/vendors/reports/summary'));
export const fetchOrderListForAllocation = async () => unwrap(await axios.get('/api/vendors/orders/list'));

export const fetchWhatsAppAttendanceSettings = async () => unwrap(await axios.get('/api/vendors/settings/whatsapp-attendance'));
export const saveWhatsAppAttendanceSettings = async (payload) => unwrap(await axios.put('/api/vendors/settings/whatsapp-attendance', payload));

export const fetchVendorSummaries = async () => unwrap(await axios.get('/api/vendors/masters/summary'));
export const fetchVendorOrderLedger = async (vendorUuid) => unwrap(await axios.get(`/vendors/masters/${vendorUuid}/order-ledger`));

export const fetchPostPrintJobs = async (filters = {}) =>
  unwrap(await axios.get('/api/vendors/production-jobs', { params: { job_category: 'post_printing', ...filters } }));

export const fetchPostPrintJobsByOrder = async (orderUuid) =>
  unwrap(await axios.get(`/api/vendors/production-jobs/by-order/${orderUuid}`));

export const updateProductionJobStatus = async (jobUuid, status) =>
  unwrap(await axios.put(`/api/vendors/production-jobs/${jobUuid}/status`, { status }));

export const fetchPostPrintPayables = async () =>
  unwrap(await axios.get('/api/vendors/post-print/payables'));

export const fetchPostPrintOrderSummary = async () =>
  unwrap(await axios.get('/api/vendors/post-print/order-summary'));
