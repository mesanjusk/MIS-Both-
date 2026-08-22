import { useEffect, useState } from 'react';

import client from '../apiClient';

/**
 * Which pages an administrator has switched off, from
 * `GET /api/api-usage/toggles`.
 *
 * Fetched once per page load and cached in memory for the session. A switch
 * change is rare — someone deliberately retiring a screen — so re-asking on
 * every navigation would be a request per click to learn nothing new. A hard
 * refresh picks up a change; so does the next login.
 *
 * It fails open. If the request errors, nothing is treated as switched off:
 * an unreachable toggle service must not be able to blank the whole
 * application, which is the failure this hook could most easily cause.
 */

let cache = null;
let inFlight = null;

async function fetchToggles() {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = client
    .get('/api/api-usage/toggles')
    .then(({ data }) => {
      cache = new Set(data?.pages || []);
      return cache;
    })
    .catch(() => {
      // Fail open, and do not cache the failure — the next caller retries.
      return new Set();
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Forget the cached set, so the next read re-fetches. */
export function invalidatePageToggles() {
  cache = null;
}

export function usePageToggles() {
  const [disabled, setDisabled] = useState(cache || new Set());
  const [loaded, setLoaded] = useState(Boolean(cache));

  useEffect(() => {
    let alive = true;
    fetchToggles().then((set) => {
      if (!alive) return;
      setDisabled(set);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    disabledPages: disabled,
    /** True only once the answer is known, so nothing flashes then vanishes. */
    togglesLoaded: loaded,
    isPageDisabled: (path) => disabled.has(path),
  };
}
