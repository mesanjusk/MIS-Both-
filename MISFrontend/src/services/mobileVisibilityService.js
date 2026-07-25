import axios from '../apiClient.js';

export const fetchMobileVisibilitySettings = () => axios.get('/api/mobile-visibility');
export const saveMobileVisibilitySettings = (payload) => axios.put('/api/mobile-visibility', payload);
