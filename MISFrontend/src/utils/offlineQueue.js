import axios from '../apiClient.js';
import { addRequest, getAllRequests, deleteRequest, clearOldRequests } from "./indexedDB";

const MAX_RETRIES = 3;

async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
}

async function syncPending() {
  await clearOldRequests();
  const requests = await getAllRequests();
  for (const req of requests) {
    try {
      await retryWithBackoff(() => axios(req));
      await deleteRequest(req.id);
    } catch (err) {
      console.warn(`[offlineQueue] Request permanently failed after ${MAX_RETRIES} attempts: ${req.url}`, err);
    }
  }
}

export function initOfflineQueue() {
  axios.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (!navigator.onLine && error.config && error.config.method !== "get") {
        try {
          await addRequest({
            url: error.config.url,
            method: error.config.method,
            data: error.config.data,
            headers: error.config.headers,
          });
        } catch (e) {
          if (e.name === 'QuotaExceededError') {
            console.warn("[offlineQueue] Storage quota exceeded — request not queued");
          } else {
            console.warn("[offlineQueue] Failed to store request", e);
          }
        }
      }
      return Promise.reject(error);
    }
  );

  window.addEventListener("online", syncPending);

  if (navigator.onLine) {
    syncPending();
  }
}
