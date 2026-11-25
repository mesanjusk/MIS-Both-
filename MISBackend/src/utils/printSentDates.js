const PRINT_TIME_ZONE = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

function recentPrintDates(now = new Date()) {
  const today = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS;
  return Array.from({ length: 7 }, (_, index) => new Date(today - index * DAY_MS).toISOString().slice(0, 10));
}

function printDateRange(firstDate, lastDate = firstDate) {
  return {
    $gte: new Date(`${firstDate}T00:00:00+05:30`),
    $lt: new Date(Date.parse(`${lastDate}T00:00:00+05:30`) + DAY_MS),
  };
}

function printPeriod(date, unit) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(date);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date) return null;
  if (unit === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  else if (unit === 'month') start.setUTCDate(1);
  else if (unit !== 'date') return null;

  const end = new Date(start);
  if (unit === 'week') end.setUTCDate(end.getUTCDate() + 6);
  if (unit === 'month') end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function groupPrintDates(dates, unit) {
  const periods = new Map();
  for (const date of dates) {
    const period = printPeriod(date, unit);
    if (!period) continue;
    if (!periods.has(period.start)) periods.set(period.start, { ...period, dates: [] });
    periods.get(period.start).dates.push(date);
  }
  return [...periods.values()];
}

module.exports = { PRINT_TIME_ZONE, recentPrintDates, printDateRange, printPeriod, groupPrintDates };
