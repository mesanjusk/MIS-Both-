import client, { getApiBase } from "../apiClient";
import { getStoredToken } from "./authStorage";

function attachAuth(config = {}) {
  const token = getStoredToken();

  if (token) {
    config.headers = {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
    };
  }

  return config;
}

export async function getWithFallback(urls, config = {}) {
  const API_BASE = getApiBase();
  const attempts = [];

  for (const u of urls) {
    const isAbsolute = /^https?:\/\//i.test(u);

    if (isAbsolute) {
      attempts.push(u);
    } else {
      attempts.push(u);

      if (API_BASE && typeof API_BASE === "string") {
        attempts.push(`${API_BASE}${u}`);
      }
    }
  }

  const seen = new Set();

  for (const url of attempts) {
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const res = await client.get(url, attachAuth(config));

      if (res && res.status >= 200 && res.status < 300) {
        return res;
      }
    } catch (_e) {}
  }

  throw new Error("All endpoints failed: " + attempts.join(" | "));
}

export async function postWithFallback(urls, body, config = {}) {
  const API_BASE = getApiBase();
  const attempts = [];

  for (const u of urls) {
    const isAbsolute = /^https?:\/\//i.test(u);

    if (isAbsolute) {
      attempts.push(u);
    } else {
      attempts.push(u);

      if (API_BASE && typeof API_BASE === "string") {
        attempts.push(`${API_BASE}${u}`);
      }
    }
  }

  const seen = new Set();

  for (const url of attempts) {
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const res = await client.post(url, body, attachAuth(config));

      if (res && res.status >= 200 && res.status < 300) {
        return res;
      }
    } catch (_e) {}
  }

  throw new Error("All POST endpoints failed: " + attempts.join(" | "));
}
