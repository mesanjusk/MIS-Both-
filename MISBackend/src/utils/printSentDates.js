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

module.exports = { PRINT_TIME_ZONE, recentPrintDates, printDateRange };
