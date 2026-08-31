// Attendance submission — the state machine both channels obey.
//
// Attendance is the source of truth the whole Operations fallback reads: an
// absent primary is what hands a responsibility to a backup. So a mark that
// should have been refused, or one that was refused when it should have been
// allowed, does not stay a small problem — it silently moves who owns work.
//
// The dashboard (routes/Attendance.js) and the WhatsApp bot
// (services/whatsappAttendanceService.js) both call these helpers, which is
// what stops the two channels drifting into different rules.

const {
  TRANSITION_MAP,
  getCurrentAttendanceType,
  isTransitionAllowed,
  getDateOnly,
  getTodayDateString,
} = require('../../src/services/attendanceService');

const record = (...types) => ({ User: types.map((Type) => ({ Type, Time: '09:00' })) });

describe('starting the day', () => {
  test('the first mark of the day must be In', () => {
    expect(isTransitionAllowed({ hasAttendance: false, currentType: null, attendanceType: 'In' }))
      .toBe(true);
  });

  test.each(['Out', 'Lunch Out', 'Lunch In'])(
    'a day cannot start with %s',
    (attendanceType) => {
      expect(isTransitionAllowed({ hasAttendance: false, currentType: null, attendanceType }))
        .toBe(false);
    }
  );

  test('an existing but empty record still requires In first', () => {
    expect(isTransitionAllowed({ hasAttendance: true, currentType: null, attendanceType: 'In' }))
      .toBe(true);
    expect(isTransitionAllowed({ hasAttendance: true, currentType: null, attendanceType: 'Out' }))
      .toBe(false);
  });
});

describe('the normal working day', () => {
  test('In -> Lunch Out -> Lunch In -> Out is allowed at each step', () => {
    const day = ['In', 'Lunch Out', 'Lunch In', 'Out'];
    for (let i = 1; i < day.length; i += 1) {
      expect(
        isTransitionAllowed({ hasAttendance: true, currentType: day[i - 1], attendanceType: day[i] })
      ).toBe(true);
    }
  });

  test('someone may close the day straight after In, without a lunch break', () => {
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'In', attendanceType: 'Out' }))
      .toBe(true);
  });

  test('a day that is closed stays closed', () => {
    for (const attendanceType of ['In', 'Lunch Out', 'Lunch In', 'Out']) {
      expect(isTransitionAllowed({ hasAttendance: true, currentType: 'Out', attendanceType }))
        .toBe(false);
    }
  });
});

describe('marks that must be refused', () => {
  test('the same mark twice in a row is refused', () => {
    for (const type of ['In', 'Lunch Out', 'Lunch In', 'Out']) {
      expect(isTransitionAllowed({ hasAttendance: true, currentType: type, attendanceType: type }))
        .toBe(false);
    }
  });

  test('lunch cannot be returned from before it is taken', () => {
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'In', attendanceType: 'Lunch In' }))
      .toBe(false);
  });

  test('the day cannot be closed while out at lunch', () => {
    // Otherwise the last entry is Out with an open Lunch Out before it, and
    // the derived status for the day becomes unreadable.
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'Lunch Out', attendanceType: 'Out' }))
      .toBe(false);
  });

  test('a second In cannot reopen a day', () => {
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'Lunch In', attendanceType: 'In' }))
      .toBe(false);
  });

  test('an unknown mark type is refused rather than accepted by default', () => {
    expect(isTransitionAllowed({ hasAttendance: true, currentType: 'In', attendanceType: 'Tea Break' }))
      .toBe(false);
  });
});

describe('getCurrentAttendanceType', () => {
  test('reads the most recent entry, not the first', () => {
    expect(getCurrentAttendanceType(record('In', 'Lunch Out', 'Lunch In'))).toBe('Lunch In');
  });

  test('is null for a day with no entries yet', () => {
    expect(getCurrentAttendanceType({ User: [] })).toBeNull();
    expect(getCurrentAttendanceType({})).toBeNull();
    expect(getCurrentAttendanceType(null)).toBeNull();
  });
});

describe('the transition map itself', () => {
  test('Out is terminal', () => {
    expect(TRANSITION_MAP.Out).toEqual([]);
  });

  test('every reachable state is a key, so no mark falls through to "allowed"', () => {
    const reachable = new Set(Object.values(TRANSITION_MAP).flat());
    for (const state of reachable) {
      expect(Object.prototype.hasOwnProperty.call(TRANSITION_MAP, state)).toBe(true);
    }
  });
});

describe('the date key a mark is filed under', () => {
  test('getDateOnly strips the time, so two marks on one day share a record', () => {
    const morning = getDateOnly(new Date('2026-08-31T04:00:00.000Z'));
    const evening = getDateOnly(new Date('2026-08-31T18:30:00.000Z'));
    expect(morning.getTime()).toBe(evening.getTime());
    expect(morning.getHours()).toBe(0);
    expect(morning.getMinutes()).toBe(0);
  });

  test('getDateOnly does not mutate the date it was given', () => {
    const original = new Date('2026-08-31T18:30:00.000Z');
    const copy = new Date(original.getTime());
    getDateOnly(original);
    expect(original.getTime()).toBe(copy.getTime());
  });

  test('getTodayDateString is a plain YYYY-MM-DD key', () => {
    expect(getTodayDateString(new Date('2026-08-31T18:30:00.000Z'))).toBe('2026-08-31');
  });
});
