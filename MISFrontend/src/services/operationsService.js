import axios from '../apiClient.js';

const BASE = '/api/operations';

// ── Settings ────────────────────────────────────────────────────────────────
export const fetchOperationsSettings = () => axios.get(`${BASE}/settings`);
export const saveStoreSettings = (payload) => axios.put(`${BASE}/settings/store`, payload);
export const savePriorityLevels = (levels, reason = '') =>
  axios.put(`${BASE}/settings/priority-levels`, { levels, reason });
export const saveDepartments = (departments, reason = '') =>
  axios.put(`${BASE}/settings/departments`, { departments, reason });
export const saveStageResponsibilities = (mapping, reason = '') =>
  axios.put(`${BASE}/settings/stage-responsibilities`, { mapping, reason });

// ── Users ───────────────────────────────────────────────────────────────────
export const fetchOperationsUsers = () => axios.get(`${BASE}/users`);
export const fetchUserOperations = (userUuid) => axios.get(`${BASE}/users/${userUuid}`);
export const saveUserOperations = (userUuid, payload) =>
  axios.put(`${BASE}/users/${userUuid}/operations`, payload);
export const setUserOperationalState = (userUuid, payload) =>
  axios.put(`${BASE}/users/${userUuid}/state`, payload);
export const fetchMyOperations = () => axios.get(`${BASE}/me`);

// ── Responsibilities ────────────────────────────────────────────────────────
export const fetchResponsibilities = () => axios.get(`${BASE}/responsibilities`);
export const createResponsibility = (payload) => axios.post(`${BASE}/responsibilities`, payload);
export const updateResponsibility = (uuid, payload) =>
  axios.put(`${BASE}/responsibilities/${uuid}`, payload);
export const deleteResponsibility = (uuid) => axios.delete(`${BASE}/responsibilities/${uuid}`);

// ── Dashboards ──────────────────────────────────────────────────────────────
export const fetchTeamStatus = (date) =>
  axios.get(`${BASE}/team-status`, { params: date ? { date } : {} });
export const fetchMyOperationsTasks = (date) =>
  axios.get(`${BASE}/my-tasks`, { params: date ? { date } : {} });
export const fetchEscalations = () => axios.get(`${BASE}/escalations`);
export const fetchOperationsDailyReport = (date) =>
  axios.get(`${BASE}/daily-report`, { params: date ? { date } : {} });
export const fetchConfigurationWarnings = () => axios.get(`${BASE}/validate`);

// ── Tasks ───────────────────────────────────────────────────────────────────
export const fetchOperationsTasks = (params = {}) => axios.get(`${BASE}/tasks`, { params });
export const createOperationsTask = (payload) => axios.post(`${BASE}/tasks`, payload);
export const updateOperationsTaskStatus = (taskUuid, status) =>
  axios.patch(`${BASE}/tasks/${taskUuid}/status`, { status });
export const requestTaskHandover = (taskUuid, reason) =>
  axios.post(`${BASE}/tasks/${taskUuid}/handover`, { reason });
export const generateDailyOperationsTasks = (date) =>
  axios.post(`${BASE}/daily-tasks/generate`, date ? { date } : {});

// ── Audit / seed ────────────────────────────────────────────────────────────
export const fetchOperationsAudit = (params = {}) => axios.get(`${BASE}/audit`, { params });
export const seedOperationsDefaults = () => axios.post(`${BASE}/seed`, {});
