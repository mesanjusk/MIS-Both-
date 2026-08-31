// The full ownership fallback matrix, including the two operators that hold
// work without clocking in: the owner, and the AI assistant.
//
// The existing operationsService.pure.test.js covers the staff line
// (primary -> backup 1..4 -> escalation). This file covers the ends of that
// chain that are not ordinary staff, and the invariant that keeps the AI
// assistant an *owner* of work rather than a participant in attendance.

const {
  isAvailableFor,
  resolveResponsibilityOwner,
} = require('../../src/services/operationsService');

const availability = (overrides = {}) => ({
  userUuid: 'u-1',
  userName: 'User One',
  backupEligible: true,
  operationsActive: true,
  attendanceStatus: 'Present',
  operationalState: 'Available',
  ...overrides,
});

/** An operator who holds work without attendance: the owner, or the AI. */
const alwaysOn = (overrides = {}) =>
  availability({ alwaysAvailable: true, attendanceStatus: 'Always On', ...overrides });

const mapOf = (entries) => new Map(Object.entries(entries));

const chain = (overrides = {}) => ({
  responsibility_uuid: 'r-1',
  name: 'Inside Store Counter',
  category: 'inside_store',
  primaryUserUuid: 'u-primary',
  backup1UserUuid: 'u-backup1',
  isCritical: true,
  ...overrides,
});

describe('the owner as a fallback holder', () => {
  test('an owner configured deep in the chain takes the work when the staff line is out', () => {
    const result = resolveResponsibilityOwner(
      chain({ backup2UserUuid: 'u-owner' }),
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
        'u-backup1': availability({ userUuid: 'u-backup1', attendanceStatus: 'On Leave' }),
        'u-owner': alwaysOn({ userUuid: 'u-owner', userName: 'Owner' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-owner', role: 'backup2' });
    expect(result.escalated).toBe(false);
  });

  test('the owner holds work without any attendance record at all', () => {
    // No clock-in, on a day they never marked: still available.
    expect(isAvailableFor(alwaysOn({ attendanceStatus: 'Absent' })).available).toBe(true);
    expect(isAvailableFor(alwaysOn({ attendanceStatus: 'Weekly Off' })).available).toBe(true);
  });

  test('an owner who is Outside still hands inside-store work on', () => {
    // Always-available exempts from attendance, not from operational state.
    const result = resolveResponsibilityOwner(
      chain({ primaryUserUuid: 'u-owner', backup1UserUuid: 'u-staff' }),
      mapOf({
        'u-owner': alwaysOn({ userUuid: 'u-owner', operationalState: 'Outside' }),
        'u-staff': availability({ userUuid: 'u-staff', userName: 'Staff' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-staff', role: 'backup1' });
  });

  test('but that same owner keeps outside-logistics work while Outside', () => {
    const result = resolveResponsibilityOwner(
      chain({ category: 'outside_logistics', primaryUserUuid: 'u-owner', backup1UserUuid: 'u-staff' }),
      mapOf({
        'u-owner': alwaysOn({ userUuid: 'u-owner', operationalState: 'Outside' }),
        'u-staff': availability({ userUuid: 'u-staff' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-owner', role: 'primary' });
  });
});

describe('the AI assistant as a fallback holder', () => {
  const AI = 'operator-ai-assistant';

  test('the AI assistant covers a responsibility the whole staff chain cannot', () => {
    const result = resolveResponsibilityOwner(
      chain({ backup2UserUuid: AI }),
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
        'u-backup1': availability({ userUuid: 'u-backup1', attendanceStatus: 'Absent' }),
        [AI]: alwaysOn({ userUuid: AI, userName: 'AI Assistant', isVirtual: true, operatorKind: 'ai' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: AI, role: 'backup2' });
    expect(result.warning).toBe('');
  });

  test('a deactivated AI assistant drops out of the chain like anyone else', () => {
    const result = resolveResponsibilityOwner(
      chain({ backup2UserUuid: AI }),
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
        'u-backup1': availability({ userUuid: 'u-backup1', attendanceStatus: 'Absent' }),
        [AI]: alwaysOn({ userUuid: AI, isVirtual: true, operationsActive: false }),
      })
    );
    expect(result.currentOwner).toBeNull();
    expect(result.warning).toBe('NO AVAILABLE OWNER');
  });

  test('the AI assistant does not displace an available human earlier in the chain', () => {
    // Ownership is strictly chain order — the AI is a fallback, not a default.
    const result = resolveResponsibilityOwner(
      chain({ backup1UserUuid: AI }),
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', userName: 'Primary' }),
        [AI]: alwaysOn({ userUuid: AI, isVirtual: true }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-primary', role: 'primary' });
  });
});

describe('the AI assistant never becomes a person', () => {
  // Requirement: the AI may own work, but must never mark attendance or stand
  // in for a real user. This is structural rather than a rule that could be
  // forgotten — a virtual operator is not a User row, and attendance is only
  // ever written against a User row.
  test('a virtual operator carries no attendance status derived from records', () => {
    const ai = alwaysOn({ userUuid: 'operator-ai-assistant', isVirtual: true, operatorKind: 'ai' });
    expect(ai.isVirtual).toBe(true);
    // 'Always On' is a computed label, not a value read from an Attendance row.
    expect(ai.attendanceStatus).toBe('Always On');
    expect(ai.inTime).toBeUndefined();
    expect(ai.outTime).toBeUndefined();
  });

  test('the attendance gate is skipped entirely for a virtual operator', () => {
    // The AI assistant carries 'Always On' rather than a status derived from
    // an Attendance row, and stays available on any day.
    const verdict = isAvailableFor(alwaysOn({ isVirtual: true }));
    expect(verdict.available).toBe(true);
    expect(verdict.reason).toBe('Always On');

    // Even if an attendance-shaped status were somehow present on the record,
    // an always-available operator does not consult it — nothing can mark the
    // AI absent, because nothing marks attendance for it at all.
    for (const status of ['Absent', 'On Leave', 'Day Closed', 'Weekly Off']) {
      expect(isAvailableFor(alwaysOn({ isVirtual: true, attendanceStatus: status })).available)
        .toBe(true);
    }
  });
});

describe('a deactivated user anywhere in the chain', () => {
  test('is skipped, and the next eligible holder takes over', () => {
    const result = resolveResponsibilityOwner(
      chain({ backup2UserUuid: 'u-backup2' }),
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', operationsActive: false }),
        'u-backup1': availability({ userUuid: 'u-backup1', operationsActive: false }),
        'u-backup2': availability({ userUuid: 'u-backup2', userName: 'Backup2' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-backup2', role: 'backup2' });
  });

  test('a present but deactivated user is still not an owner', () => {
    expect(isAvailableFor(availability({ operationsActive: false, attendanceStatus: 'Present' })).available)
      .toBe(false);
  });
});
