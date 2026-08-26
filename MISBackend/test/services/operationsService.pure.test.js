const {
  parseClockMinutes,
  deriveAttendanceStatus,
  isAvailableFor,
  resolveResponsibilityOwner,
  validateConfiguration,
  findPriorityConflicts,
  DEFAULT_STORE_SETTINGS,
} = require('../../src/services/operationsService');

// A Monday, so the default working days (Mon–Sat) apply.
const MONDAY = new Date('2026-08-24T06:00:00.000Z');
const SUNDAY = new Date('2026-08-23T06:00:00.000Z');

const availability = (overrides = {}) => ({
  userUuid: 'u-1',
  userName: 'User One',
  backupEligible: true,
  operationsActive: true,
  attendanceStatus: 'Present',
  operationalState: 'Available',
  ...overrides,
});

describe('parseClockMinutes', () => {
  test('parses 24-hour, zero-padded and 12-hour clock strings', () => {
    expect(parseClockMinutes('09:30')).toBe(570);
    expect(parseClockMinutes('9:30')).toBe(570);
    expect(parseClockMinutes('21:05')).toBe(1265);
    expect(parseClockMinutes('09:30 AM')).toBe(570);
    expect(parseClockMinutes('09:30 PM')).toBe(1290);
    expect(parseClockMinutes('12:15 AM')).toBe(15);
    expect(parseClockMinutes('12:15 PM')).toBe(735);
  });

  test('returns null for unusable values instead of guessing', () => {
    for (const value of ['', null, undefined, 'lunchtime', '25:00', '10:99']) {
      expect(parseClockMinutes(value)).toBeNull();
    }
  });
});

describe('deriveAttendanceStatus', () => {
  const base = { storeSettings: DEFAULT_STORE_SETTINGS, now: MONDAY };

  test('no record on a working day is Absent', () => {
    expect(deriveAttendanceStatus({ ...base, attendance: null }).status).toBe('Absent');
  });

  test('no record but a declared absence is On Leave', () => {
    const result = deriveAttendanceStatus({
      ...base,
      attendance: null,
      absence: { reason: 'Family function' },
    });
    expect(result.status).toBe('On Leave');
    expect(result.detail).toBe('Family function');
  });

  test('no record on a non-working day is Weekly Off, not Absent', () => {
    expect(deriveAttendanceStatus({ ...base, attendance: null, now: SUNDAY }).status).toBe('Weekly Off');
  });

  test('per-user working days override the store default', () => {
    // Sunday is a working day for this user, so a missing record is a real absence.
    const result = deriveAttendanceStatus({
      ...base,
      attendance: null,
      now: SUNDAY,
      workingDays: [0, 1, 2, 3, 4, 5],
    });
    expect(result.status).toBe('Absent');
  });

  test('an In punch before reporting time + grace is Present', () => {
    const result = deriveAttendanceStatus({
      ...base,
      attendance: { Status: 'Active', User: [{ Type: 'In', Time: '09:25' }] },
    });
    expect(result.status).toBe('Present');
    expect(result.inTime).toBe('09:25');
  });

  test('an In punch past reporting time + grace is Late but still counted as in', () => {
    const result = deriveAttendanceStatus({
      ...base,
      attendance: { Status: 'Active', User: [{ Type: 'In', Time: '10:05' }] },
    });
    expect(result.status).toBe('Late');
    expect(result.detail).toMatch(/35 min late/);
  });

  test('the grace window keeps a marginally late punch as Present', () => {
    const result = deriveAttendanceStatus({
      ...base,
      attendance: { Status: 'Active', User: [{ Type: 'In', Time: '09:39' }] },
    });
    expect(result.status).toBe('Present');
  });

  test('Lunch Out is On Break; a following Lunch In returns to Present', () => {
    const entries = [{ Type: 'In', Time: '09:20' }, { Type: 'Lunch Out', Time: '13:00' }];
    expect(deriveAttendanceStatus({ ...base, attendance: { Status: 'Active', User: entries } }).status)
      .toBe('On Break');

    entries.push({ Type: 'Lunch In', Time: '13:30' });
    expect(deriveAttendanceStatus({ ...base, attendance: { Status: 'Active', User: entries } }).status)
      .toBe('Present');
  });

  test('a final Out punch closes the day', () => {
    const result = deriveAttendanceStatus({
      ...base,
      attendance: {
        Status: 'Completed',
        User: [{ Type: 'In', Time: '09:20' }, { Type: 'Out', Time: '19:30' }],
      },
    });
    expect(result.status).toBe('Day Closed');
    expect(result.outTime).toBe('19:30');
  });

  test('half-day and leave written into the existing free-text Status are honoured', () => {
    expect(
      deriveAttendanceStatus({ ...base, attendance: { Status: 'Half Day', User: [{ Type: 'In', Time: '09:20' }] } })
        .status
    ).toBe('Half Day');
    expect(
      deriveAttendanceStatus({ ...base, attendance: { Status: 'On Leave', User: [] } }).status
    ).toBe('On Leave');
  });
});

describe('isAvailableFor', () => {
  test('a present, available user is available for any category', () => {
    for (const category of ['general', 'inside_store', 'outside_logistics']) {
      expect(isAvailableFor(availability(), category).available).toBe(true);
    }
  });

  test('Late and Half Day still count as available', () => {
    expect(isAvailableFor(availability({ attendanceStatus: 'Late' })).available).toBe(true);
    expect(isAvailableFor(availability({ attendanceStatus: 'Half Day' })).available).toBe(true);
  });

  test('absent, on leave, on break and day-closed users are unavailable', () => {
    for (const status of ['Absent', 'On Leave', 'On Break', 'Day Closed', 'Weekly Off']) {
      const verdict = isAvailableFor(availability({ attendanceStatus: status }));
      expect(verdict.available).toBe(false);
      expect(verdict.reason).toBe(status);
    }
  });

  test('a user marked Outside stays available for outside logistics only', () => {
    const outside = availability({ operationalState: 'Outside' });
    expect(isAvailableFor(outside, 'outside_logistics').available).toBe(true);
    expect(isAvailableFor(outside, 'inside_store').available).toBe(false);
    expect(isAvailableFor(outside, 'general').available).toBe(false);
  });

  test('a user inactive in operations is never available, even when present', () => {
    expect(isAvailableFor(availability({ operationsActive: false })).available).toBe(false);
  });

  test('Busy is a soft unavailability so the UI can distinguish it', () => {
    const verdict = isAvailableFor(availability({ operationalState: 'Busy' }));
    expect(verdict).toMatchObject({ available: false, reason: 'Busy', soft: true });
  });
});

describe('resolveResponsibilityOwner', () => {
  const responsibility = {
    responsibility_uuid: 'r-1',
    name: 'Customer Delivery',
    category: 'outside_logistics',
    primaryUserUuid: 'u-primary',
    backup1UserUuid: 'u-backup1',
    backup2UserUuid: 'u-backup2',
    isCritical: true,
  };

  const mapOf = (entries) => new Map(Object.entries(entries));

  test('an available primary keeps the responsibility', () => {
    const result = resolveResponsibilityOwner(
      responsibility,
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', userName: 'Primary' }),
        'u-backup1': availability({ userUuid: 'u-backup1', userName: 'Backup1' }),
        'u-backup2': availability({ userUuid: 'u-backup2', userName: 'Backup2' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-primary', role: 'primary' });
    expect(result.escalated).toBe(false);
  });

  test('an absent primary hands over to backup 1 without touching the configuration', () => {
    const result = resolveResponsibilityOwner(
      responsibility,
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
        'u-backup1': availability({ userUuid: 'u-backup1', userName: 'Backup1' }),
        'u-backup2': availability({ userUuid: 'u-backup2', userName: 'Backup2' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-backup1', role: 'backup1' });
    expect(result.configured).toEqual({
      primaryUserUuid: 'u-primary',
      backup1UserUuid: 'u-backup1',
      backup2UserUuid: 'u-backup2',
    });
  });

  test('primary and backup 1 both out falls through to backup 2', () => {
    const result = resolveResponsibilityOwner(
      responsibility,
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
        'u-backup1': availability({ userUuid: 'u-backup1', attendanceStatus: 'On Leave' }),
        'u-backup2': availability({ userUuid: 'u-backup2', userName: 'Backup2' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-backup2', role: 'backup2' });
  });

  test('everyone unavailable escalates loudly rather than dropping the work', () => {
    const result = resolveResponsibilityOwner(
      responsibility,
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
        'u-backup1': availability({ userUuid: 'u-backup1', attendanceStatus: 'Absent' }),
        'u-backup2': availability({ userUuid: 'u-backup2', attendanceStatus: 'Absent' }),
      })
    );
    expect(result.currentOwner).toBeNull();
    expect(result.escalated).toBe(true);
    expect(result.warning).toBe('NO AVAILABLE OWNER');
  });

  test('escalation never silently falls back to a priority — the chain is the whole story', () => {
    // A P1 user exists and is fully available, but is not in this chain.
    const result = resolveResponsibilityOwner(
      responsibility,
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
        'u-backup1': availability({ userUuid: 'u-backup1', attendanceStatus: 'Absent' }),
        'u-backup2': availability({ userUuid: 'u-backup2', attendanceStatus: 'Absent' }),
        'u-p1': availability({ userUuid: 'u-p1', userName: 'Senior Designer', priority: 'P1' }),
      })
    );
    expect(result.escalated).toBe(true);
    expect(result.chain.some((slot) => slot.userUuid === 'u-p1')).toBe(false);
  });

  test('an Outside logistics user still owns outside work', () => {
    const result = resolveResponsibilityOwner(
      responsibility,
      mapOf({
        'u-primary': availability({ userUuid: 'u-primary', operationalState: 'Outside' }),
        'u-backup1': availability({ userUuid: 'u-backup1' }),
        'u-backup2': availability({ userUuid: 'u-backup2' }),
      })
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-primary', role: 'primary' });
  });

  test('the same Outside user steps aside for inside-store work so the store keeps running', () => {
    const insideStore = { ...responsibility, name: 'Packaging', category: 'inside_store' };
    const result = resolveResponsibilityOwner(
      insideStore,
      new Map(
        Object.entries({
          'u-primary': availability({ userUuid: 'u-primary', operationalState: 'Outside' }),
          'u-backup1': availability({ userUuid: 'u-backup1', userName: 'Store Support' }),
          'u-backup2': availability({ userUuid: 'u-backup2' }),
        })
      )
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-backup1', role: 'backup1' });
    expect(result.escalated).toBe(false);
  });

  test('a backup who is not backup-eligible is skipped, but a primary is not', () => {
    const result = resolveResponsibilityOwner(
      responsibility,
      new Map(
        Object.entries({
          'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
          'u-backup1': availability({ userUuid: 'u-backup1', backupEligible: false }),
          'u-backup2': availability({ userUuid: 'u-backup2', userName: 'Backup2' }),
        })
      )
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-backup2', role: 'backup2' });
    expect(result.chain[1]).toMatchObject({ available: false, reason: 'Not backup eligible' });
  });

  test('a slot pointing at a deleted user is flagged rather than crashing', () => {
    const result = resolveResponsibilityOwner(
      { ...responsibility, backup1UserUuid: 'u-ghost' },
      new Map(
        Object.entries({
          'u-primary': availability({ userUuid: 'u-primary', attendanceStatus: 'Absent' }),
          'u-backup2': availability({ userUuid: 'u-backup2', userName: 'Backup2' }),
        })
      )
    );
    expect(result.chain[1]).toMatchObject({ invalid: true, reason: 'Invalid user reference' });
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-backup2' });
  });

  test('an unconfigured primary is reported but does not stop backup 1 taking over', () => {
    const result = resolveResponsibilityOwner(
      { ...responsibility, primaryUserUuid: '' },
      new Map(
        Object.entries({
          'u-backup1': availability({ userUuid: 'u-backup1', userName: 'Backup1' }),
          'u-backup2': availability({ userUuid: 'u-backup2' }),
        })
      )
    );
    expect(result.chain[0]).toMatchObject({ configured: false, reason: 'Not configured' });
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-backup1' });
  });
});

describe('validateConfiguration', () => {
  const users = [
    { User_uuid: 'u-1', User_name: 'One' },
    { User_uuid: 'u-2', User_name: 'Two' },
  ];
  const availabilityMap = new Map([
    ['u-1', availability({ userUuid: 'u-1', userName: 'One' })],
    ['u-2', availability({ userUuid: 'u-2', userName: 'Two', backupEligible: false, operationsActive: false })],
  ]);

  test('a critical responsibility with no primary is an error', () => {
    const warnings = validateConfiguration({
      responsibilities: [{ responsibility_uuid: 'r', name: 'QC', isCritical: true, primaryUserUuid: '' }],
      availabilityMap,
      users,
    });
    expect(warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 'error', message: 'No primary user assigned' })])
    );
  });

  test('a critical responsibility with no backup cover is an error', () => {
    const warnings = validateConfiguration({
      responsibilities: [
        { responsibility_uuid: 'r', name: 'QC', isCritical: true, primaryUserUuid: 'u-1' },
      ],
      availabilityMap,
      users,
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Critical responsibility has no backup cover' }),
      ])
    );
  });

  test('the same user in two slots is flagged', () => {
    const warnings = validateConfiguration({
      responsibilities: [
        {
          responsibility_uuid: 'r',
          name: 'QC',
          primaryUserUuid: 'u-1',
          backup1UserUuid: 'u-1',
        },
      ],
      availabilityMap,
      users,
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'The same user is assigned to more than one slot' }),
      ])
    );
  });

  test('an inactive or non-eligible backup is flagged', () => {
    const warnings = validateConfiguration({
      responsibilities: [
        { responsibility_uuid: 'r', name: 'QC', primaryUserUuid: 'u-1', backup1UserUuid: 'u-2' },
      ],
      availabilityMap,
      users,
    });
    const messages = warnings.map((warning) => warning.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'Backup 1 (Two) is inactive in operations',
        'Backup 1 (Two) is not marked backup eligible',
      ])
    );
  });

  test('a slot pointing at a deleted user is an error', () => {
    const warnings = validateConfiguration({
      responsibilities: [
        { responsibility_uuid: 'r', name: 'QC', primaryUserUuid: 'u-gone' },
      ],
      availabilityMap,
      users,
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Primary points at a user that no longer exists' }),
      ])
    );
  });

  test('a fully configured chain produces no warnings', () => {
    const warnings = validateConfiguration({
      responsibilities: [
        {
          responsibility_uuid: 'r',
          name: 'QC',
          isCritical: true,
          primaryUserUuid: 'u-1',
          backup1UserUuid: '',
          backup2UserUuid: 'u-1',
        },
      ],
      availabilityMap,
      users: [{ User_uuid: 'u-1', User_name: 'One' }],
    });
    // Only the duplicate-slot warning; no missing-cover errors.
    expect(warnings.filter((warning) => warning.level === 'error')).toEqual([]);
  });
});

describe('findPriorityConflicts', () => {
  test('two active users holding the same code is reported', () => {
    const conflicts = findPriorityConflicts([
      { User_uuid: 'a', User_name: 'A', operations: { priority: 'P1', active: true } },
      { User_uuid: 'b', User_name: 'B', operations: { priority: 'P1', active: true } },
      { User_uuid: 'c', User_name: 'C', operations: { priority: 'P2', active: true } },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].priority).toBe('P1');
    expect(conflicts[0].holders.map((holder) => holder.User_name)).toEqual(['A', 'B']);
  });

  test('inactive and unprioritised users are ignored', () => {
    expect(
      findPriorityConflicts([
        { User_uuid: 'a', User_name: 'A', operations: { priority: 'P1', active: true } },
        { User_uuid: 'b', User_name: 'B', operations: { priority: 'P1', active: false } },
        { User_uuid: 'c', User_name: 'C', operations: {} },
        { User_uuid: 'd', User_name: 'D' },
      ])
    ).toEqual([]);
  });
});
