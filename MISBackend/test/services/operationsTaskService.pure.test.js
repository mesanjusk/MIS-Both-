const {
  isDone,
  taskIsOverdue,
  resolveTaskOwnership,
} = require('../../src/services/operationsTaskService');

const availability = (overrides = {}) => ({
  userUuid: 'u-1',
  userName: 'User One',
  backupEligible: true,
  operationsActive: true,
  attendanceStatus: 'Present',
  operationalState: 'Available',
  ...overrides,
});

const mapOf = (entries) => new Map(Object.entries(entries));

describe('isDone', () => {
  test('recognises the done-ish statuses used across the existing task screens', () => {
    for (const status of ['Completed', 'completed', 'Done', 'done', 'Closed', 'cancelled']) {
      expect(isDone(status)).toBe(true);
    }
    for (const status of ['Pending', 'In Progress', 'Waiting', '', null, undefined]) {
      expect(isDone(status)).toBe(false);
    }
  });
});

describe('taskIsOverdue', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');

  test('an open task past its deadline is overdue', () => {
    expect(taskIsOverdue({ Status: 'Pending', Deadline: '2026-08-24T09:00:00.000Z' }, now)).toBe(true);
  });

  test('an open task with a future deadline is not overdue', () => {
    expect(taskIsOverdue({ Status: 'Pending', Deadline: '2026-08-24T18:00:00.000Z' }, now)).toBe(false);
  });

  test('a completed task is never overdue, deadline notwithstanding', () => {
    expect(taskIsOverdue({ Status: 'Completed', Deadline: '2026-08-01T09:00:00.000Z' }, now)).toBe(false);
  });

  test('a task with no deadline is not overdue', () => {
    expect(taskIsOverdue({ Status: 'Pending', Deadline: null }, now)).toBe(false);
  });
});

describe('resolveTaskOwnership', () => {
  test('the task chain wins when the task carries its own users', () => {
    const result = resolveTaskOwnership(
      { primaryUserUuid: 'u-a', backup1UserUuid: 'u-b', category: 'general' },
      mapOf({
        'u-a': availability({ userUuid: 'u-a', userName: 'A' }),
        'u-b': availability({ userUuid: 'u-b', userName: 'B' }),
      }),
      new Map()
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-a', role: 'primary' });
    expect(result.transferred).toBe(false);
  });

  test('a task with no chain of its own inherits the linked responsibility chain', () => {
    const responsibilities = mapOf({
      'r-1': {
        responsibility_uuid: 'r-1',
        category: 'inside_store',
        primaryUserUuid: 'u-a',
        backup1UserUuid: 'u-b',
        backup2UserUuid: '',
      },
    });
    const result = resolveTaskOwnership(
      { responsibility_uuid: 'r-1' },
      mapOf({
        'u-a': availability({ userUuid: 'u-a', attendanceStatus: 'Absent' }),
        'u-b': availability({ userUuid: 'u-b', userName: 'B' }),
      }),
      responsibilities
    );
    expect(result.category).toBe('inside_store');
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-b', role: 'backup1' });
    expect(result.transferred).toBe(true);
  });

  test('a task inherited by a backup is flagged transferred so the cover is visible', () => {
    const result = resolveTaskOwnership(
      { primaryUserUuid: 'u-a', backup1UserUuid: 'u-b', backup2UserUuid: 'u-c' },
      mapOf({
        'u-a': availability({ userUuid: 'u-a', attendanceStatus: 'On Leave' }),
        'u-b': availability({ userUuid: 'u-b', attendanceStatus: 'Absent' }),
        'u-c': availability({ userUuid: 'u-c', userName: 'C' }),
      }),
      new Map()
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-c', role: 'backup2' });
    expect(result.transferred).toBe(true);
    expect(result.escalated).toBe(false);
  });

  test('a task falls through to backup 4 before it escalates', () => {
    const chain = {
      primaryUserUuid: 'u-a',
      backup1UserUuid: 'u-b',
      backup2UserUuid: 'u-c',
      backup3UserUuid: 'u-d',
      backup4UserUuid: 'u-e',
    };
    const absent = (userUuid) => availability({ userUuid, attendanceStatus: 'Absent' });

    const result = resolveTaskOwnership(
      chain,
      mapOf({
        'u-a': absent('u-a'),
        'u-b': absent('u-b'),
        'u-c': absent('u-c'),
        'u-d': absent('u-d'),
        'u-e': availability({ userUuid: 'u-e', userName: 'E' }),
      }),
      new Map()
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-e', role: 'backup4' });
    expect(result.ownerRole).toBe('backup4');
    expect(result.transferred).toBe(true);
    expect(result.escalated).toBe(false);
  });

  test('a task with no chain of its own inherits the deep responsibility backups', () => {
    const responsibilities = mapOf({
      'r-1': {
        responsibility_uuid: 'r-1',
        category: 'general',
        primaryUserUuid: 'u-a',
        backup1UserUuid: 'u-b',
        backup3UserUuid: 'u-d',
      },
    });
    const result = resolveTaskOwnership(
      { responsibility_uuid: 'r-1' },
      mapOf({
        'u-a': availability({ userUuid: 'u-a', attendanceStatus: 'Absent' }),
        'u-b': availability({ userUuid: 'u-b', attendanceStatus: 'On Leave' }),
        'u-d': availability({ userUuid: 'u-d', userName: 'D' }),
      }),
      responsibilities
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-d', role: 'backup3' });
  });

  test('no available owner anywhere in the chain escalates', () => {
    const result = resolveTaskOwnership(
      { primaryUserUuid: 'u-a', backup1UserUuid: 'u-b' },
      mapOf({
        'u-a': availability({ userUuid: 'u-a', attendanceStatus: 'Absent' }),
        'u-b': availability({ userUuid: 'u-b', attendanceStatus: 'Absent' }),
      }),
      new Map()
    );
    expect(result.currentOwner).toBeNull();
    expect(result.escalated).toBe(true);
    expect(result.ownerRole).toBe('escalated');
  });

  test('an outside-logistics task stays with the user who is out doing it', () => {
    const result = resolveTaskOwnership(
      { primaryUserUuid: 'u-a', backup1UserUuid: 'u-b', category: 'outside_logistics' },
      mapOf({
        'u-a': availability({ userUuid: 'u-a', userName: 'A', operationalState: 'Outside' }),
        'u-b': availability({ userUuid: 'u-b', userName: 'B' }),
      }),
      new Map()
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-a', role: 'primary' });
  });

  test('an inside-store task moves to the backup while the primary is outside', () => {
    const result = resolveTaskOwnership(
      { primaryUserUuid: 'u-a', backup1UserUuid: 'u-b', category: 'inside_store' },
      mapOf({
        'u-a': availability({ userUuid: 'u-a', userName: 'A', operationalState: 'Outside' }),
        'u-b': availability({ userUuid: 'u-b', userName: 'B' }),
      }),
      new Map()
    );
    expect(result.currentOwner).toMatchObject({ userUuid: 'u-b', role: 'backup1' });
    expect(result.escalated).toBe(false);
  });

  test('the returning primary takes the task back with no repair step', () => {
    const chain = { primaryUserUuid: 'u-a', backup1UserUuid: 'u-b' };
    const whileAway = resolveTaskOwnership(
      chain,
      mapOf({
        'u-a': availability({ userUuid: 'u-a', attendanceStatus: 'Absent' }),
        'u-b': availability({ userUuid: 'u-b', userName: 'B' }),
      }),
      new Map()
    );
    expect(whileAway.currentOwner.userUuid).toBe('u-b');

    const afterReturn = resolveTaskOwnership(
      chain,
      mapOf({
        'u-a': availability({ userUuid: 'u-a', userName: 'A' }),
        'u-b': availability({ userUuid: 'u-b', userName: 'B' }),
      }),
      new Map()
    );
    expect(afterReturn.currentOwner).toMatchObject({ userUuid: 'u-a', role: 'primary' });
    expect(afterReturn.transferred).toBe(false);
    // The configuration itself was never rewritten.
    expect(chain).toEqual({ primaryUserUuid: 'u-a', backup1UserUuid: 'u-b' });
  });
});
