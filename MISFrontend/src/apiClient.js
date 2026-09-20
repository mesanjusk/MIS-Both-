import axios from "axios";
import { getStoredToken, clearStoredToken } from "./utils/authStorage";

let redirectingToLogin = false;

// ─── Base URLs (NO /api suffix — all request paths already include /api/...) ───
// If VITE_API_SERVER accidentally has /api suffix, strip it to prevent /api/api/... double prefix.
// Production is controlled by VITE_API_SERVER. dash.sanjusk.in is currently
// configured to use the long-running MIS backend below, so do not silently
// rewrite it to another Render service in application code.
const PRODUCTION_SERVER = "https://misbackend-e078.onrender.com";

const stripApiSuffix = (url) => (url ? String(url).replace(/\/api\/?$/, "").replace(/\/$/, "") : url);

const LOCAL_API  = stripApiSuffix(import.meta.env.VITE_API_LOCAL) || "http://localhost:5000";
const SERVER_API = stripApiSuffix(import.meta.env.VITE_API_SERVER) || PRODUCTION_SERVER;

const hostname    = window.location.hostname;
const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

const currentBaseURL = isLocalhost ? LOCAL_API : SERVER_API;

const client = axios.create({
  baseURL: currentBaseURL,
});

// Short-lived, user-scoped GET cache. It removes repeated loading when users
// revisit screens while keeping business data fresh. Successful writes clear
// it immediately, so create/update/delete flows never show their own stale data.
const GET_CACHE_TTL_MS = 30_000;
const GET_CACHE_MAX_ENTRIES = 120;
const responseCache = new Map();

const stableSerialize = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const authHeader = (headers) => {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return headers.get("Authorization") || headers.get("authorization") || "";
  }
  return headers.Authorization || headers.authorization || "";
};

const shouldCacheGet = (config) => {
  if (String(config?.method || "get").toLowerCase() !== "get") return false;
  if (config?.cache === false) return false;

  const url = String(config?.url || "");
  // Real-time/auth/health endpoints should always hit the backend.
  return !/(\/auth\/|\/login(?:[/?]|$)|\/logout(?:[/?]|$)|\/health(?:[/?]|$)|\/version(?:[/?]|$)|\/status(?:[/?]|$)|\/whatsapp|\/messages(?:[/?]|$)|\/notifications(?:[/?]|$))/i.test(url);
};

const cacheKeyFor = (config) => [
  String(config?.baseURL || currentBaseURL),
  String(config?.url || ""),
  stableSerialize(config?.params),
  authHeader(config?.headers),
].join("|");

const getCachedResponse = (key) => {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > GET_CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }

  // Refresh insertion order so frequently reused screens remain in the LRU set.
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry;
};

const putCachedResponse = (key, response) => {
  if (!key) return;

  if (responseCache.size >= GET_CACHE_MAX_ENTRIES && !responseCache.has(key)) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }

  responseCache.set(key, {
    cachedAt: Date.now(),
    data: response.data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

export const clearApiCache = () => {
  responseCache.clear();
};

client.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      };
    }

    if (shouldCacheGet(config)) {
      const key = cacheKeyFor(config);
      config.__misCacheKey = key;
      const cached = getCachedResponse(key);

      if (cached) {
        // Axios supports a per-request adapter. Returning the cached response
        // here skips the network while preserving the normal interceptor chain.
        config.adapter = async () => ({
          data: cached.data,
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers,
          config,
          request: { __misMemoryCache: true },
        });
        config.__misFromMemoryCache = true;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

client.interceptors.response.use(
  (response) => {
    const config = response?.config || {};
    const method = String(config.method || "get").toLowerCase();

    if (method === "get" && shouldCacheGet(config) && !config.__misFromMemoryCache) {
      putCachedResponse(config.__misCacheKey || cacheKeyFor(config), response);
    } else if (method !== "get") {
      // A successful mutation can make any previously fetched list/summary
      // stale, so invalidate centrally instead of relying on every page author.
      clearApiCache();
    }

    return response;
  },
  async (error) => {
    const originalConfig = error?.config || {};
    const status = error?.response?.status;
    const isNetworkFailure = !error?.response;

    // On 401 (expired / invalid token), clear storage and send to login.
    // Skip if the failing request is already the login endpoint itself.
    if (status === 401 && !originalConfig.url?.includes('/login')) {
      if (!redirectingToLogin) {
        redirectingToLogin = true;
        clearApiCache();
        clearStoredToken();
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // A local request that cannot reach a local server used to be retried
    // against the configured server — production by default — for every method,
    // so a development POST, PUT or DELETE could be replayed against live data
    // whenever the local backend was simply not running. The environment is
    // chosen once, at startup, from VITE_API_LOCAL / VITE_API_SERVER; a failure
    // to reach it is reported rather than quietly sent somewhere else.
    if (isLocalhost && isNetworkFailure) {
      console.error(
        `Could not reach the API at ${currentBaseURL}. Start the local backend, or point VITE_API_LOCAL at the environment you mean to use.`
      );
    }

    return Promise.reject(error);
  }
);

export default client;
export const getApiBase = () => currentBaseURL;
