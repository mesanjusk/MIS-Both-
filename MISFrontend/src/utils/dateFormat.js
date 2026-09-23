// Central date formatting helpers for the MIS UI.
// Storage/API values remain ISO; user-visible dates use DD-MM-YYYY.
const pad2 = (value) => String(value).padStart(2, '0');
export function formatDate(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  const text = String(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) return text;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback || text;
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}
export function formatDateTime(value, fallback = '') {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback || String(value);
  return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
export function toIsoDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text;
}
export const DATE_DISPLAY_FORMAT = 'DD-MM-YYYY';
