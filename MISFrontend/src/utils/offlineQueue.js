import axios from '../apiClient.js';
import { addRequest, getAllRequests, deleteRequest } from "./indexedDB";

async function syncPending() {
  const requests = await getAllRequests();
  for (const req of requests) {
    try {
      await axios(req);
      await deleteRequest(req.id);
    } catch (err) {
      console.warn("Resend failed", err);
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
          console.warn("Store request failed", e);
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
