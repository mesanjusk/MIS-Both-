import axios from "axios";
import { getStoredToken, clearStoredToken } from "./utils/authStorage";

let redirectingToLogin = false;

// ─── Base URLs (NO /api suffix — all request paths already include /api/...) ───
// If VITE_API_SERVER accidentally has /api suffix, strip it to prevent /api/api/... double prefix.
const PRODUCTION_SERVER = "https://misbackend-e078.onrender.com";

const stripApiSuffix = (url) => (url ? String(url).replace(/\/api\/?$/, "") : url);

const LOCAL_API  = stripApiSuffix(import.meta.env.VITE_API_LOCAL)  || "http://localhost:5000";
const SERVER_API = stripApiSuffix(import.meta.env.VITE_API_SERVER) || PRODUCTION_SERVER;

const hostname    = window.location.hostname;
const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

const currentBaseURL = isLocalhost ? LOCAL_API : SERVER_API;

const client = axios.create({
  baseURL: currentBaseURL,
});

client.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  },
  (error) => Promise.reject(error)
);

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalConfig = error?.config || {};
    const status = error?.response?.status;
    const isNetworkFailure = !error?.response;

    // On 401 (expired / invalid token), clear storage and send to login.
    // Skip if the failing request is already the login endpoint itself.
    if (status === 401 && !originalConfig.url?.includes('/login')) {
      if (!redirectingToLogin) {
        redirectingToLogin = true;
        clearStoredToken();
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    const canRetryRemote =
      isLocalhost &&
      SERVER_API &&
      originalConfig.baseURL !== SERVER_API &&
      !originalConfig.__retriedWithServer &&
      isNetworkFailure;

    if (canRetryRemote) {
      originalConfig.__retriedWithServer = true;
      originalConfig.baseURL = SERVER_API;
      return client(originalConfig);
    }

    return Promise.reject(error);
  }
);

export default client;
export const getApiBase = () => currentBaseURL;
