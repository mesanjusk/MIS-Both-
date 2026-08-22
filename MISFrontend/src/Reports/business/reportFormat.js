/**
 * Presentation helpers for the admin business reports.
 *
 * Pure and separate from the components so the awkward cases — an undefined
 * margin, a negative profit, a rate over an empty denominator — are decided
 * once and tested, rather than re-derived in each of six tables.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A value that is absent rather than zero. `Number(null)` and `Number('')` are
 * both 0, so testing finiteness alone would turn a missing figure into a
 * confident ₹0 — which in a margin column reads as a fact rather than a gap.
 */
function isMissing(value) {
  return value === null || value === undefined || value === '';
}

/**
 * Rupees. Whole amounts lose the trailing `.00` — a table of round numbers is
 * easier to scan — but anything with paise keeps both places rather than
 * rounding silently to a figure that does not match the invoice.
 */
export function money(value) {
  if (isMissing(value)) return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return Number.isInteger(amount) ? INR.format(amount) : INR_PRECISE.format(amount);
}

/**
 * A share as a percentage. `null` means the question had no answer — a margin
 * on zero revenue, an on-time rate over no dated orders — and prints as a dash
 * rather than 0%, which would read as a real and very bad result.
 */
export function percent(share, digits = 1) {
  if (isMissing(share) || !Number.isFinite(Number(share))) return '—';
  return `${(Number(share) * 100).toFixed(digits)}%`;
}

/** A plain count, grouped for readability. */
export function count(value) {
  if (isMissing(value)) return '—';
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—';
}

/** Tailwind classes for an amount that may be a loss. */
export function amountTone(value) {
  return Number(value) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100';
}

/**
 * Build the query string for a report request. Only the parts that differ from
 * the default are sent, so a shared link stays short and the server's own
 * defaults keep working.
 */
export function buildReportQuery({ preset, from, to, granularity } = {}) {
  const params = new URLSearchParams();
  if (from && to) {
    params.set('from', from);
    params.set('to', to);
  } else if (preset && preset !== '30d') {
    params.set('preset', preset);
  }
  if (granularity) params.set('granularity', granularity);
  return params.toString();
}

export const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

export const GRANULARITIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export const REPORT_TABS = [
  { value: 'summary', label: 'Profit' },
  { value: 'items', label: 'Item wise' },
  { value: 'orders', label: 'Order wise' },
  { value: 'vendors', label: 'Vendor wise' },
  { value: 'employees', label: 'Employee wise' },
  { value: 'performance', label: 'Performance' },
];

/**
 * RFC 4180 CSV. Quoting is not optional: an item called `Rose, gold foil` or a
 * vendor name with a comma would otherwise tear a row in half the moment
 * someone opens the file in Excel.
 */
export function toCsv(headers, rows) {
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}
