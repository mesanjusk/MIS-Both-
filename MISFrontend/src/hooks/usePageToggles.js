import { useEffect, useState } from 'react';
import { matchPath } from 'react-router-dom';

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
      cache = {
        pages: new Set(data?.pages || []),
        apis: new Set(data?.apis || []),
      };
      return cache;
    })
    .catch(() => {
      // Fail open, and do not cache the failure — the next caller retries.
      return { pages: new Set(), apis: new Set() };
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Forget the cached set, so the next read re-fetches. */
export function invalidatePageToggles() {
  cache = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('feature-toggles-invalidated'));
  }
}

/** Match both literal and React Router parameterised paths. */
export function pagePatternMatches(pattern, pathname) {
  if (!pattern || !pathname) return false;
  if (!pattern.includes(':') && !pattern.includes('*')) {
    return pattern.replace(/\/$/, '') === pathname.replace(/\/$/, '');
  }
  return Boolean(matchPath({ path: pattern, end: true }, pathname));
}

export function usePageToggles() {
  const [disabled, setDisabled] = useState(
    cache || { pages: new Set(), apis: new Set() }
  );
  const [loaded, setLoaded] = useState(Boolean(cache));

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetchToggles().then((set) => {
        if (!alive) return;
        setDisabled(set);
        setLoaded(true);
      });
    };
    refresh();
    window.addEventListener('feature-toggles-invalidated', refresh);
    return () => {
      alive = false;
      window.removeEventListener('feature-toggles-invalidated', refresh);
    };
  }, []);

  return {
    disabledPages: disabled.pages,
    disabledApis: disabled.apis,
    /** True only once the answer is known, so nothing flashes then vanishes. */
    togglesLoaded: loaded,
    isPageDisabled: (path) =>
      [...disabled.pages].some((pattern) => pagePatternMatches(pattern, path)),
    isApiDisabled: (key) => disabled.apis.has(key),
  };
}
