/* global __APP_VERSION__ */

export function initVersionChecker(interval = 5 * 60 * 1000) {
  const check = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.version && data.version !== __APP_VERSION__) {
          window.location.reload();
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('Failed to check app version', err);
    }
  };

  check();
  return setInterval(check, interval);
}
