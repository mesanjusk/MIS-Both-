const { recentPrintDates, printDateRange, printPeriod, groupPrintDates } = require('../../src/utils/printSentDates');

test('lists seven Indian calendar dates, crossing midnight and the year boundary', () => {
  expect(recentPrintDates(new Date('2026-12-31T18:29:59.999Z'))[0]).toBe('2026-12-31');
  expect(recentPrintDates(new Date('2026-12-31T18:30:00.000Z'))).toEqual([
    '2027-01-01', '2026-12-31', '2026-12-30', '2026-12-29', '2026-12-28', '2026-12-27', '2026-12-26',
  ]);
});

test('groups Monday-to-Sunday weeks over year boundaries and handles leap months', () => {
  expect(printPeriod('2026-01-01', 'week')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
  expect(printPeriod('2028-02-12', 'month')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  expect(printPeriod('2026-02-30', 'date')).toBeNull();
  expect(groupPrintDates(['2026-01-05', '2026-01-04', '2026-01-01'], 'week')).toEqual([
    { start: '2026-01-05', end: '2026-01-11', dates: ['2026-01-05'] },
    { start: '2025-12-29', end: '2026-01-04', dates: ['2026-01-04', '2026-01-01'] },
  ]);
});

test('uses a half-open time range from the first to the last included date', () => {
  expect(printDateRange('2026-11-25')).toEqual({
    $gte: new Date('2026-11-24T18:30:00.000Z'),
    $lt: new Date('2026-11-25T18:30:00.000Z'),
  });
  expect(printDateRange('2026-11-19', '2026-11-25')).toEqual({
    $gte: new Date('2026-11-18T18:30:00.000Z'),
    $lt: new Date('2026-11-25T18:30:00.000Z'),
  });
});
