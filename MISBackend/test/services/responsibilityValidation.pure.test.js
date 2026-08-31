// Save-time validation of operations configuration.
//
// These are the checks that refuse a write. The separate
// `validateConfiguration` warnings (operationsService.pure.test.js) report on
// what is already stored; these stop a new chain that could never resolve.
//
// The governing constraint is that they must not make existing records
// un-editable — a responsibility configured before these checks existed has to
// stay fixable through the UI.

const {
  validateResponsibilityChain,
  validateWorkingHours,
  validatePriorityLevels,
  parseClock,
} = require('../../src/services/responsibilityValidation');

const operators = new Map([
  ['u-alice', { name: 'Alice', active: true, backupEligible: true, isVirtual: false }],
  ['u-bob', { name: 'Bob', active: true, backupEligible: true, isVirtual: false }],
  ['u-carol', { name: 'Carol', active: true, backupEligible: true, isVirtual: false }],
  ['u-gone', { name: 'Gone', active: false, backupEligible: true, isVirtual: false }],
  ['u-notbackup', { name: 'NotBackup', active: true, backupEligible: false, isVirtual: false }],
  ['operator-ai-assistant', { name: 'AI Assistant', active: true, backupEligible: true, isVirtual: true }],
]);

const check = (submitted, existing = null) =>
  validateResponsibilityChain({ submitted, existing, operators });

describe('duplicate assignment within one chain', () => {
  test('the primary cannot also be a backup', () => {
    const errors = check({ primaryUserUuid: 'u-alice', backup1UserUuid: 'u-alice' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/same person as the Primary/i);
    expect(errors[0]).toContain('Alice');
  });

  test('the primary is caught in any backup slot, not just the first', () => {
    for (const field of ['backup1UserUuid', 'backup2UserUuid', 'backup3UserUuid', 'backup4UserUuid']) {
      const errors = check({ primaryUserUuid: 'u-alice', [field]: 'u-alice' });
      expect(errors.join(' ')).toMatch(/same person as the Primary/i);
    }
  });

  test('two backups cannot be the same person', () => {
    const errors = check({
      primaryUserUuid: 'u-alice',
      backup1UserUuid: 'u-bob',
      backup2UserUuid: 'u-bob',
    });
    expect(errors.join(' ')).toMatch(/appears in both/i);
    expect(errors.join(' ')).toContain('Bob');
  });

  test('a duplicate against an untouched stored primary is still caught', () => {
    // Only backup2 is submitted; the clash is with what is already stored.
    const errors = check({ backup2UserUuid: 'u-alice' }, { primaryUserUuid: 'u-alice' });
    expect(errors.join(' ')).toMatch(/same person as the Primary/i);
  });

  test('a properly distinct chain passes', () => {
    expect(check({
      primaryUserUuid: 'u-alice',
      backup1UserUuid: 'u-bob',
      backup2UserUuid: 'u-carol',
    })).toEqual([]);
  });

  test('empty slots are not duplicates of each other', () => {
    expect(check({
      primaryUserUuid: 'u-alice',
      backup1UserUuid: '',
      backup2UserUuid: '',
      backup3UserUuid: '',
    })).toEqual([]);
  });
});

describe('who may be newly assigned', () => {
  test('an unknown uuid is refused', () => {
    const errors = check({ primaryUserUuid: 'u-does-not-exist' });
    expect(errors.join(' ')).toMatch(/does not exist/i);
  });

  test('a deactivated user cannot be newly assigned', () => {
    const errors = check({ primaryUserUuid: 'u-gone' });
    expect(errors.join(' ')).toMatch(/deactivated/i);
    expect(errors.join(' ')).toContain('Gone');
  });

  test('a backup-ineligible user cannot be put in a backup slot', () => {
    const errors = check({ primaryUserUuid: 'u-alice', backup1UserUuid: 'u-notbackup' });
    expect(errors.join(' ')).toMatch(/not marked backup eligible/i);
  });

  test('but a backup-ineligible user may be the primary — that flag is about cover', () => {
    expect(check({ primaryUserUuid: 'u-notbackup' })).toEqual([]);
  });

  test('the AI assistant may hold a slot like any other operator', () => {
    expect(check({
      primaryUserUuid: 'u-alice',
      backup1UserUuid: 'operator-ai-assistant',
    })).toEqual([]);
  });

  test('the AI assistant may be the primary owner of an area', () => {
    expect(check({ primaryUserUuid: 'operator-ai-assistant' })).toEqual([]);
  });
});

describe('existing records stay editable', () => {
  test('an untouched slot holding a deactivated user does not block an unrelated edit', () => {
    // Renaming the responsibility must not require repairing a chain the
    // person editing may not be able to repair.
    const errors = check({ name: 'Renamed area' }, { primaryUserUuid: 'u-gone' });
    expect(errors).toEqual([]);
  });

  test('re-submitting the same deactivated user unchanged is not a new assignment', () => {
    const errors = check({ primaryUserUuid: 'u-gone' }, { primaryUserUuid: 'u-gone' });
    expect(errors).toEqual([]);
  });

  test('but moving a deactivated user into a different slot is a new assignment', () => {
    const errors = check({ backup1UserUuid: 'u-gone' }, { primaryUserUuid: 'u-gone' });
    expect(errors.join(' ')).toMatch(/deactivated/i);
  });

  test('clearing a slot is always allowed, even to fix a broken chain', () => {
    expect(check({ primaryUserUuid: '' }, { primaryUserUuid: 'u-does-not-exist' })).toEqual([]);
  });

  test('a stored chain that already duplicates is not blocked until it is touched', () => {
    const stored = { primaryUserUuid: 'u-alice', backup1UserUuid: 'u-alice' };
    expect(check({ description: 'note' }, stored)).toEqual([]);
  });
});

describe('working hours and days', () => {
  test.each(['09:30', '9:30', '18:00', '6:00 PM', '12:00 AM'])('%s is accepted', (value) => {
    expect(validateWorkingHours({ startTime: value })).toEqual([]);
  });

  test.each(['half nine', '25:00', '09:75', '9', '', null])(
    'a malformed start time (%s) is rejected or ignored, never stored as-is',
    (value) => {
      const errors = validateWorkingHours({ startTime: value });
      // Empty clears the field; anything else non-parseable is an error.
      if (value === '' || value === null) expect(errors).toEqual([]);
      else expect(errors.join(' ')).toMatch(/must be a time/i);
    }
  );

  test('an end time before the start time is rejected', () => {
    const errors = validateWorkingHours({ startTime: '18:00', endTime: '09:00' });
    expect(errors.join(' ')).toMatch(/endTime must be later/i);
  });

  test('an end time equal to the start time is rejected', () => {
    expect(validateWorkingHours({ startTime: '09:00', endTime: '09:00' }).join(' '))
      .toMatch(/endTime must be later/i);
  });

  test('a normal shift passes', () => {
    expect(validateWorkingHours({ startTime: '10:00', endTime: '19:30' })).toEqual([]);
  });

  test('break times are checked the same way', () => {
    expect(validateWorkingHours({ breakStart: '14:00', breakEnd: '13:00' }).join(' '))
      .toMatch(/breakEnd must be later/i);
    expect(validateWorkingHours({ breakStart: '13:00', breakEnd: '14:00' })).toEqual([]);
  });

  test('only the submitted fields are checked, so a partial update stays partial', () => {
    expect(validateWorkingHours({ endTime: '19:30' })).toEqual([]);
    expect(validateWorkingHours({})).toEqual([]);
  });

  test('working days must be 0-6', () => {
    expect(validateWorkingHours({ workingDays: [1, 2, 3, 4, 5, 6] })).toEqual([]);
    expect(validateWorkingHours({ workingDays: [0] })).toEqual([]);
    expect(validateWorkingHours({ workingDays: [7] }).join(' ')).toMatch(/invalid day numbers/i);
    expect(validateWorkingHours({ workingDays: [-1] }).join(' ')).toMatch(/invalid day numbers/i);
    expect(validateWorkingHours({ workingDays: 'monday' }).join(' ')).toMatch(/must be a list/i);
  });
});

describe('the priority catalogue', () => {
  test('P1-P4 plus the owner and AI codes are a valid catalogue', () => {
    expect(validatePriorityLevels([
      { code: 'P1' }, { code: 'P2' }, { code: 'P3' }, { code: 'P4' },
      { code: 'OWNER' }, { code: 'AI' },
    ])).toEqual([]);
  });

  test('the catalogue is not restricted to P1-P4 — management may add codes', () => {
    expect(validatePriorityLevels([{ code: 'P5' }, { code: 'NIGHT' }])).toEqual([]);
  });

  test('a level with no code is rejected', () => {
    expect(validatePriorityLevels([{ code: 'P1' }, { label: 'oops' }]).join(' '))
      .toMatch(/has no code/i);
  });

  test('a duplicate code is rejected, case-insensitively', () => {
    expect(validatePriorityLevels([{ code: 'P1' }, { code: 'p1' }]).join(' '))
      .toMatch(/more than once/i);
  });

  test('a non-list catalogue is rejected', () => {
    expect(validatePriorityLevels('P1,P2').join(' ')).toMatch(/must be a list/i);
  });
});

describe('parseClock', () => {
  test('returns minutes since midnight', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('6:00 PM')).toBe(1080);
    expect(parseClock('12:00 AM')).toBe(0);
    expect(parseClock('12:30 PM')).toBe(750);
  });

  test('returns null rather than guessing at nonsense', () => {
    for (const value of ['', null, undefined, 'noon', '99:99', '24:00']) {
      expect(parseClock(value)).toBeNull();
    }
  });
});
