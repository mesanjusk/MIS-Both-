/**
 * backendWake.js
 *
 * Render free-tier backends sleep after 15 min of inactivity.
 * The first request after sleep gets a 503 while the server boots (~20-40s).
 *
 * This utility pings the health-check endpoint and waits until the backend
 * responds before the rest of the app fires its requests.
 */

const HEALTH_URL = `${
  (import.meta.env.VITE_API_SERVER || 'https://misbackend-e078.onrender.com')
    .replace(/\/api\/?$/, '')
}/`;

const MAX_ATTEMPTS = 15;      // 15 × 3s = 45 seconds max wait
const RETRY_INTERVAL_MS = 3000;

let wakePromise = null;

export function wakeBackend() {
  // Only ping once — all callers share the same promise
  if (wakePromise) return wakePromise;

  wakePromise = (async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        const res = await fetch(HEALTH_URL, { method: 'GET', signal: AbortSignal.timeout(5000) });
        if (res.ok) return true;  // backend is up
      } catch {
        // still sleeping — wait and retry
      }
      await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    }
    return false; // gave up — let requests fire anyway
  })();

  return wakePromise;
}
