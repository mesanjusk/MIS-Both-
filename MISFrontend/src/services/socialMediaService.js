import axios from '../apiClient';

// Thin wrappers around /api/social/* — mirrors the existing *Service.js
// convention (orderService.js, gmailService.js): no business logic here,
// just typed calls the pages use directly.

export const getOverview = () => axios.get('/api/social/overview').then((r) => r.data.data);

export const getPlatformStatus = () => axios.get('/api/social/accounts/platform-status').then((r) => r.data.data);
export const listAccounts = (params = {}) => axios.get('/api/social/accounts', { params }).then((r) => r.data.data);
export const getAccount = (id) => axios.get(`/api/social/accounts/${id}`).then((r) => r.data.data);
export const validateAccount = (id) => axios.post(`/api/social/accounts/${id}/validate`).then((r) => r.data.data);
export const disconnectAccount = (id) => axios.post(`/api/social/accounts/${id}/disconnect`).then((r) => r.data.data);
export const getConnectUrl = (provider) => axios.get(`/api/social/providers/${provider}/connect`).then((r) => r.data.authUrl);

export const listPosts = (params = {}) => axios.get('/api/social/posts', { params }).then((r) => r.data);
export const getPost = (id) => axios.get(`/api/social/posts/${id}`).then((r) => r.data.data);
export const createPost = (payload) => axios.post('/api/social/posts', payload).then((r) => r.data.data);
export const updatePost = (id, payload) => axios.patch(`/api/social/posts/${id}`, payload).then((r) => r.data.data);
export const deletePost = (id) => axios.delete(`/api/social/posts/${id}`).then((r) => r.data);
export const submitPost = (id) => axios.post(`/api/social/posts/${id}/submit`).then((r) => r.data.data);
export const approvePost = (id) => axios.post(`/api/social/posts/${id}/approve`).then((r) => r.data.data);
export const rejectPost = (id, reason) => axios.post(`/api/social/posts/${id}/reject`, { reason }).then((r) => r.data.data);
export const schedulePost = (id, scheduledAt, timezone) =>
  axios.post(`/api/social/posts/${id}/schedule`, { scheduledAt, timezone }).then((r) => r.data.data);
export const cancelPost = (id) => axios.post(`/api/social/posts/${id}/cancel`).then((r) => r.data.data);
export const publishPostNow = (id) => axios.post(`/api/social/posts/${id}/publish`).then((r) => r.data.data);
export const retryPost = (id) => axios.post(`/api/social/posts/${id}/retry`).then((r) => r.data.data);

export const getCalendar = (params = {}) => axios.get('/api/social/calendar', { params }).then((r) => r.data.data);

export const listAssets = (params = {}) => axios.get('/api/social/assets', { params }).then((r) => r.data);
export const uploadAsset = (file, extra = {}, onUploadProgress) => {
  const form = new FormData();
  form.append('file', file);
  Object.entries(extra).forEach(([k, v]) => v != null && form.append(k, v));
  return axios.post('/api/social/assets', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  }).then((r) => r.data.data);
};
export const deleteAsset = (id) => axios.delete(`/api/social/assets/${id}`).then((r) => r.data);

export const getAnalytics = (params = {}) => axios.get('/api/social/analytics', { params }).then((r) => r.data.data);
export const refreshAnalytics = (postId, platform) =>
  axios.post('/api/social/analytics/refresh', { postId, platform }).then((r) => r.data.data);

export const listCampaigns = () => axios.get('/api/social/campaigns').then((r) => r.data.data);
export const createCampaign = (payload) => axios.post('/api/social/campaigns', payload).then((r) => r.data.data);
