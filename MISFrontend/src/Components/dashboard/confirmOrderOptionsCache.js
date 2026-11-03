// Browser-session cache for master dropdowns used by "Confirm MIS Order".
// Successful inline additions refresh only the affected list.
const TIME_TO_LIVE = 15 * 60 * 1000;
const entries = new Map();
const pending = new Map();
const keyFor = (scope, resource) =>
  `mis.confirmOrder.v1:${encodeURIComponent(scope || 'current-user')}:${resource}`;

export function readConfirmOptions(scope, resource) {
  const key = keyFor(scope, resource);
  let entry = entries.get(key);
  if (!entry) {
    try {
      const saved = window.sessionStorage.getItem(key);
      if (saved) entry = JSON.parse(saved);
    } catch { /* storage unavailable */ }
    if (entry) entries.set(key, entry);
  }
  return Array.isArray(entry?.rows) && Date.now() - entry.savedAt < TIME_TO_LIVE
    ? entry.rows : null;
}

export function replaceConfirmOptions(scope, resource, rows) {
  const key = keyFor(scope, resource);
  const entry = { rows: Array.isArray(rows) ? rows : [], savedAt: Date.now() };
  entries.set(key, entry);
  try { window.sessionStorage.setItem(key, JSON.stringify(entry)); }
  catch { /* storage unavailable or quota exceeded */ }
  return entry.rows;
}

export async function loadConfirmOptions(scope, resource, loader) {
  const cached = readConfirmOptions(scope, resource);
  if (cached) return cached;
  const key = keyFor(scope, resource);
  if (pending.has(key)) return pending.get(key);
  const request = Promise.resolve()
    .then(loader)
    .then((rows) => replaceConfirmOptions(scope, resource, rows))
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function clearConfirmOptionsCache() {
  for (const key of entries.keys()) {
    try { window.sessionStorage.removeItem(key); } catch { /* no storage */ }
  }
  entries.clear();
  pending.clear();
}
