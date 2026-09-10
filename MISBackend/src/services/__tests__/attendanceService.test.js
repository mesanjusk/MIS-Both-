const {
  getDateOnly,
  getTodayDateString,
  getKnownAttendanceTypes,
  isTransitionAllowed,
} = require('../attendanceService');

describe('attendanceService shared attendance rules', () => {
  test('uses the India business day around UTC midnight boundaries', () => {
    const timestamp = new Date('2026-09-10T19:30:00.000Z'); // 01:00 IST on Sep 11
    expect(getTodayDateString(timestamp)).toBe('2026-09-11');
    expect(getDateOnly(timestamp).toISOString()).toBe('2026-09-11T00:00:00.000Z');
  });

  test('keeps the existing sequential attendance transitions', () => {
    expect(isTransitionAllowed({ hasAttendance: false, currentType: null, attendanceType: 'In' })).toBe(true);
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'In', attendanceType: 'Lunch Out' })).toBe(true);
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'Lunch Out', attendanceType: 'Lunch In' })).toBe(true);
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'Lunch In', attendanceType: 'Out' })).toBe(true);
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'In', attendanceType: 'In' })).toBe(false);
  });

  test('exposes canonical attendance types for device configuration', () => {
    expect(getKnownAttendanceTypes()).toEqual(expect.arrayContaining(['In', 'Lunch Out', 'Lunch In', 'Out']));
  });
});
