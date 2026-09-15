/**
 * Attendance used two disagreeing definitions of "today" — a UTC date string
 * and a local midnight — while the daily schedulers worked in Asia/Kolkata.
 * Everything from 18:30 UTC onward is already the next working day in India,
 * so marks made in the evening were filed under the wrong date.
 *
 * These assert in UTC so they hold whatever the server's clock is set to.
 */
const { businessDateString, businessDayKey, BUSINESS_TIMEZONE } =
  require('../../src/utils/businessDay');

const at = (iso) => new Date(iso);

describe('businessDateString', () => {
  test('answers in the business timezone, not UTC', () => {
    expect(businessDateString(at('2026-08-31T18:29:00.000Z'))).toBe('2026-08-31');
    // 18:30Z is midnight in India — already the next day.
    expect(businessDateString(at('2026-08-31T18:30:00.000Z'))).toBe('2026-09-01');
  });

  test('a late-UTC-evening moment is the following Indian day', () => {
    expect(businessDateString(at('2026-08-30T20:00:00.000Z'))).toBe('2026-08-31');
  });

  test('defaults to Asia/Kolkata', () => {
    expect(BUSINESS_TIMEZONE).toBe('Asia/Kolkata');
  });
});

describe('businessDayKey', () => {
  test('buckets every moment of one Indian day to the same key', () => {
    const start = businessDayKey(at('2026-08-30T18:30:00.000Z')); // 00:00 IST 31 Aug
    const mid   = businessDayKey(at('2026-08-31T06:00:00.000Z')); // 11:30 IST 31 Aug
    const end   = businessDayKey(at('2026-08-31T18:29:59.000Z')); // 23:59 IST 31 Aug

    expect(start.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(mid.getTime()).toBe(start.getTime());
    expect(end.getTime()).toBe(start.getTime());
  });

  test('rolls to a new key at Indian midnight', () => {
    expect(businessDayKey(at('2026-08-31T18:29:00.000Z')).toISOString())
      .toBe('2026-08-31T00:00:00.000Z');
    expect(businessDayKey(at('2026-08-31T18:30:00.000Z')).toISOString())
      .toBe('2026-09-01T00:00:00.000Z');
  });

  test('does not mutate the date it was given', () => {
    const original = at('2026-08-31T18:30:00.000Z');
    const before = original.getTime();
    businessDayKey(original);
    expect(original.getTime()).toBe(before);
  });

  test('is stable across month and year boundaries', () => {
    // 18:30Z on 31 December is 1 January in India.
    expect(businessDayKey(at('2026-12-31T18:30:00.000Z')).toISOString())
      .toBe('2027-01-01T00:00:00.000Z');
  });
});
