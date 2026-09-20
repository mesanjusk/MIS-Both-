import { useEffect, useRef, useState } from 'react';
import {
  UNSAFE_LocationContext as LocationContext,
  useLocation,
  useNavigationType,
  useOutlet,
} from 'react-router-dom';

import PageToggleGuard from './PageToggleGuard';

const routeCacheKey = (pathname) => {
  const normalized = String(pathname || '/').replace(/\/+$/, '');
  return normalized || '/';
};

/**
 * Keeps every authenticated route the user has visited mounted for the rest of
 * the signed-in app session.
 *
 * React Router normally unmounts one route when another route is selected.
 * Most screens load their data in mount effects, so returning to a page causes
 * another loading state and another API round-trip. This cache keeps the actual
 * route element alive and only hides inactive routes with CSS.
 *
 * Search/hash changes intentionally share the pathname key. That means a page
 * such as /accounts/ledger?tab=statement keeps one mounted Ledger instance
 * rather than creating a separate cached copy for every tab/filter URL.
 */
export default function KeepAliveOutlet() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const currentKey = routeCacheKey(location.pathname);
  const cacheRef = useRef(new Map());
  const [cachedKeys, setCachedKeys] = useState([]);

  // Always retain the newest route element for the active pathname. React
  // reconciles it under the same keyed pane, so component state is preserved.
  if (outlet) {
    cacheRef.current.set(currentKey, {
      element: outlet,
      location,
      navigationType,
    });
  }

  useEffect(() => {
    if (!outlet) return;

    setCachedKeys((current) => {
      if (current.includes(currentKey)) return current;
      return [...current, currentKey];
    });
  }, [currentKey, outlet]);

  if (!outlet && cachedKeys.length === 0) return null;

  // Include a newly visited route immediately; the effect above records it for
  // later navigation. Keeping the same pane key prevents a remount when the
  // state update lands.
  const paneKeys = cachedKeys.includes(currentKey)
    ? cachedKeys
    : [...cachedKeys, currentKey];

  return (
    <>
      {paneKeys.map((key) => {
        const isActive = key === currentKey;
        const cached = cacheRef.current.get(key);
        const entry = isActive
          ? { element: outlet, location, navigationType }
          : cached;
        if (!entry?.element) return null;

        return (
          <div
            key={key}
            data-route-keep-alive={key}
            aria-hidden={!isActive}
            style={{
              display: isActive ? 'block' : 'none',
              minHeight: '100%',
              width: '100%',
            }}
          >
            <LocationContext.Provider
              value={{
                location: entry.location,
                navigationType: entry.navigationType,
              }}
            >
              <PageToggleGuard pathname={key} active={isActive}>
                {entry.element}
              </PageToggleGuard>
            </LocationContext.Provider>
          </div>
        );
      })}
    </>
  );
}
