/**
 * One definition of "which day is it" for the whole application.
 *
 * Attendance mixed two: a UTC date string from toISOString(), and a local
 * midnight from setHours(0,0,0,0) — while the daily schedulers worked
 * explicitly in Asia/Kolkata. The three agree only when the server happens to
 * run in UTC and the moment is not near midnight; in India everything from
 * 18:30 UTC onward is already the next business day.
 *
 * Both helpers here answer in the business timezone, whatever the server's own
 * clock is set to.
 */

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';

/**
 * How far the zone's wall clock is ahead of UTC at a given instant, in ms.
 * Derived from Intl, so daylight-saving shifts are handled by the platform.
 */
function zoneOffsetMs(instant, timeZone = BUSINESS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
    .formatToParts(instant)
    .reduce((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});

  // hour comes back as 24 for midnight in some locales.
  const asIfUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second
  );
  return asIfUtc - instant.getTime();
}

/**
 * The business date of a moment, as 'YYYY-MM-DD'.
 * en-CA formats as YYYY-MM-DD, which is what the stored keys use.
 */
function businessDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(date));
}

/**
 * The canonical Date that buckets `date` into its business day.
 *
 * This is a day *key*, not an instant: the business calendar date read as UTC
 * midnight. Two moments on the same business day produce the same value —
 * including across UTC midnight, where a local or UTC-derived midnight splits
 * one Indian working day in two.
 *
 * UTC midnight of the business date is the representation the WhatsApp
 * attendance path already writes, so records from every channel key alike and
 * existing rows keep matching.
 */
function businessDayKey(date = new Date()) {
  return new Date(`${businessDateString(date)}T00:00:00.000Z`);
}

module.exports = {
  BUSINESS_TIMEZONE,
  businessDateString,
  businessDayKey,
  zoneOffsetMs,
};
