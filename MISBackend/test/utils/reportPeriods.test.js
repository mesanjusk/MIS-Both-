const {
  DEFAULT_UTC_OFFSET_MINUTES,
  defaultGranularityFor,
  endOfPeriod,
  periodKey,
  periodLabel,
  periodStarts,
  reportOffsetMinutes,
  resolveRange,
  startOfPeriod,
  toDateInputValue,
} = require('../../src/utils/reportPeriods');

const IST = DEFAULT_UTC_OFFSET_MINUTES;

describe('period bucketing', () => {
  it("buckets by the studio's day, not the server's", () => {
    // 20:00 UTC on the 21st is 01:30 IST on the 22nd. The same order must not
    // land in two different days depending on where it is read.
    const lateNight = new Date('2026-08-21T20:00:00Z');
    expect(periodKey(lateNight, 'daily', IST)).toBe('2026-08-22');
    expect(periodKey(lateNight, 'daily', 0)).toBe('2026-08-21');
  });

  it('starts weeks on Monday', () => {
    // 22 Aug 2026 is a Saturday; its week began Monday the 17th.
    expect(toDateInputValue(startOfPeriod(new Date('2026-08-22T06:00:00Z'), 'weekly', IST), IST))
      .toBe('2026-08-17');
    // A Sunday belongs to the week that started six days earlier.
    expect(toDateInputValue(startOfPeriod(new Date('2026-08-23T06:00:00Z'), 'weekly', IST), IST))
      .toBe('2026-08-17');
  });

  it('labels an ISO week by the year the week belongs to', () => {
    // 1 Jan 2027 is a Friday, so it sits in the last week of 2026.
    expect(periodKey(new Date('2027-01-01T06:00:00Z'), 'weekly', IST)).toBe('2026-W53');
    expect(periodKey(new Date('2027-01-04T06:00:00Z'), 'weekly', IST)).toBe('2027-W01');
  });

  it('rolls a month end over to the next month', () => {
    const start = startOfPeriod(new Date('2026-12-20T06:00:00Z'), 'monthly', IST);
    expect(toDateInputValue(start, IST)).toBe('2026-12-01');
    expect(toDateInputValue(endOfPeriod(start, 'monthly', IST), IST)).toBe('2027-01-01');
  });

  it('handles February in a leap year', () => {
    const starts = periodStarts(
      new Date('2028-02-27T06:00:00Z'),
      new Date('2028-03-01T06:00:00Z'),
      'daily',
      IST
    );
    expect(starts.map((s) => toDateInputValue(s, IST))).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('prints a readable label per granularity', () => {
    const day = startOfPeriod(new Date('2026-08-22T06:00:00Z'), 'daily', IST);
    expect(periodLabel(day, 'daily', IST)).toBe('22 Aug 2026');
    expect(periodLabel(startOfPeriod(day, 'weekly', IST), 'weekly', IST)).toBe('Week of 17 Aug 2026');
    expect(periodLabel(startOfPeriod(day, 'monthly', IST), 'monthly', IST)).toBe('Aug 2026');
  });

  it('falls back to IST when the offset override is nonsense', () => {
    expect(reportOffsetMinutes(undefined)).toBe(IST);
    expect(reportOffsetMinutes('not-a-number')).toBe(IST);
    expect(reportOffsetMinutes('99999')).toBe(IST);
    expect(reportOffsetMinutes('-480')).toBe(-480);
  });
});

describe('resolveRange', () => {
  const now = new Date('2026-08-22T06:00:00Z');

  it('defaults to the last 30 days', () => {
    const range = resolveRange({}, now, IST);
    expect(range.preset).toBe('30d');
    expect(toDateInputValue(range.from, IST)).toBe('2026-07-24');
    // `to` is exclusive — tomorrow's midnight, so today is included whole.
    expect(toDateInputValue(range.to, IST)).toBe('2026-08-23');
  });

  it('treats a single custom day as a whole day', () => {
    const range = resolveRange({ from: '2026-08-22', to: '2026-08-22' }, now, IST);
    expect(range.preset).toBe('custom');
    expect(toDateInputValue(range.from, IST)).toBe('2026-08-22');
    expect(toDateInputValue(range.to, IST)).toBe('2026-08-23');
  });

  it('swaps a custom range entered backwards rather than returning nothing', () => {
    const range = resolveRange({ from: '2026-08-22', to: '2026-08-01' }, now, IST);
    expect(toDateInputValue(range.from, IST)).toBe('2026-08-01');
    expect(toDateInputValue(range.to, IST)).toBe('2026-08-23');
  });

  it('ignores an unparseable preset or date instead of erroring', () => {
    expect(resolveRange({ preset: 'since-forever' }, now, IST).preset).toBe('30d');
    expect(resolveRange({ from: 'yesterday', to: 'today' }, now, IST).preset).toBe('30d');
    // One valid half is not a custom range — both ends are required.
    expect(resolveRange({ from: '2026-08-01' }, now, IST).preset).toBe('30d');
  });

  it('resolves last month to the whole previous month', () => {
    const range = resolveRange({ preset: 'last-month' }, now, IST);
    expect(toDateInputValue(range.from, IST)).toBe('2026-07-01');
    expect(toDateInputValue(range.to, IST)).toBe('2026-08-01');
  });

  it('resolves the last 12 months back to the first of the month', () => {
    expect(toDateInputValue(resolveRange({ preset: '12m' }, now, IST).from, IST)).toBe('2025-09-01');
  });

  it('picks a granularity a range can be read at', () => {
    expect(defaultGranularityFor(resolveRange({ preset: '7d' }, now, IST))).toBe('daily');
    expect(defaultGranularityFor(resolveRange({ preset: '30d' }, now, IST))).toBe('weekly');
    expect(defaultGranularityFor(resolveRange({ preset: '12m' }, now, IST))).toBe('monthly');
  });
});
