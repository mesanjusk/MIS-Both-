const {
  getDateOnly,
  getTodayDateString,
  getKnownAttendanceTypes,
  isTransitionAllowed,
} = require('../attendanceService');

describe('attendanceService shared attendance rules', () => {
  test('preserves the existing date-only attendance key contract', () => {
    const timestamp = new Date('2026-09-10T19:30:00.000Z');
    expect(getTodayDateString(timestamp)).toBe('2026-09-10');
    const normalized = getDateOnly(timestamp);
    expect(normalized.getHours()).toBe(0);
    expect(normalized.getMinutes()).toBe(0);
    expect(normalized.getSeconds()).toBe(0);
    expect(normalized.getMilliseconds()).toBe(0);
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
