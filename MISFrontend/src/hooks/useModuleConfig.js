import { useEffect, useState } from 'react';

import client from '../apiClient';

/**
 * Which optional modules this deployment has actually configured.
 *
 * Gmail, the social platforms and the WhatsApp flow builder all depend on
 * third-party credentials that many deployments never set. Without this the
 * menus advertise them anyway, and every link leads to a screen that can only
 * report a missing environment variable — which reads as a broken product
 * rather than an unconfigured one.
 *
 * Fetched once per page load and cached for the session, like the page
 * toggles: credentials change when someone edits the deployment, not while
 * someone is clicking around.
 *
 * It fails *closed* for the modules and open for everything else: if the
 * request errors, optional modules stay hidden rather than showing links that
 * probably do not work. Nothing core is gated on this.
 */

let cache = null;
let inFlight = null;

const EMPTY = { social: {}, socialAny: false, gmail: false, flowBuilder: false };

async function fetchModuleConfig() {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = client
    .get('/api/social/providers/status')
    .then(({ data }) => {
      cache = { ...EMPTY, ...(data?.result || {}) };
      return cache;
    })
    .catch(() => EMPTY) // not cached, so the next caller retries
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Forget the cached answer, so the next read re-fetches. */
export function invalidateModuleConfig() {
  cache = null;
}

export function useModuleConfig() {
  const [config, setConfig] = useState(cache || EMPTY);
  const [loaded, setLoaded] = useState(Boolean(cache));

  useEffect(() => {
    let alive = true;
    fetchModuleConfig().then((next) => {
      if (!alive) return;
      setConfig(next);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  return { ...config, moduleConfigLoaded: loaded };
}
