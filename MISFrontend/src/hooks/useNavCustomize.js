import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'nav_customize';
const EVENT = 'nav-customize-changed';

function read() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function useNavCustomize() {
  const [prefs, setPrefs] = useState(read);

  useEffect(() => {
    const handle = () => setPrefs(read());
    window.addEventListener(EVENT, handle);
    return () => window.removeEventListener(EVENT, handle);
  }, []);

  const save = useCallback((next) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { prefs, save };
}

export const isLeftItemVisible = (prefs, path) =>
  !(prefs.leftHidden || []).includes(path);

export const isRightActionVisible = (prefs, label) =>
  !(prefs.rightActionsHidden || []).includes(label);

export const isRightLinkVisible = (prefs, label) =>
  !(prefs.rightLinksHidden || []).includes(label);

export const isTopNavItemVisible = (prefs, label) =>
  !(prefs.topNavHidden || []).includes(label);

export const isFooterLinkVisible = (prefs, label) =>
  !(prefs.footerHidden || []).includes(label);
