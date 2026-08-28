// The User-Wise Tasks panel on the home dashboard used to group tasks by the
// name stored on the row. That name is whoever the task was created for, not
// whoever holds it today — so a task the responsibility chain had moved to a
// backup, the owner, or the AI assistant showed under someone who was on
// leave. These cover the live resolution that replaced it.

const {
  resolveOperationsOwner,
  buildUserWiseAssignedTasks,
} = require('../../src/controllers/dashboardSummaryController');

const availability = (overrides = {}) => ({
  userUuid: 'u-1',
  userName: 'User One',
  backupEligible: true,
  operationsActive: true,
  attendanceStatus: 'Present',
  operationalState: 'Available',
  isVirtual: false,
  operatorKind: 'user',
  ...overrides,
});

const contextOf = (entries, responsibilities = []) => ({
  availabilityMap: new Map(Object.entries(entries)),
  responsibilityByUuid: new Map(
    responsibilities.map((item) => [item.responsibility_uuid, item])
  ),
});

describe('resolveOperationsOwner', () => {
  test('an ordinary task with no chain is left to the existing stored name', () => {
    const context = contextOf({ 'u-1': availability() });
    expect(resolveOperationsOwner({ User: 'Ana' }, context)).toBeNull();
  });

  test('no context (operations lookup failed) never breaks the row', () => {
    expect(resolveOperationsOwner({ primaryUserUuid: 'u-1' }, null)).toBeNull();
  });

  test('a task whose primary is absent reports the backup actually holding it', () => {
    const context = contextOf({
      'u-1': availability({ userUuid: 'u-1', attendanceStatus: 'Absent' }),
      'u-2': availability({ userUuid: 'u-2', userName: 'Bea' }),
    });
    expect(
      resolveOperationsOwner({ primaryUserUuid: 'u-1', backup1UserUuid: 'u-2' }, context)
    ).toMatchObject({ userName: 'Bea', ownerRole: 'backup1', transferred: true, isVirtual: false });
  });

  test('a task held by the AI assistant is reported as an automated operator', () => {
    const context = contextOf({
      'u-1': availability({ userUuid: 'u-1', attendanceStatus: 'Absent' }),
      'operator-ai': availability({
        userUuid: 'operator-ai',
        userName: 'AI Assistant',
        alwaysAvailable: true,
        attendanceStatus: 'Always On',
        isVirtual: true,
        operatorKind: 'ai',
      }),
    });
    expect(
      resolveOperationsOwner({ primaryUserUuid: 'u-1', backup1UserUuid: 'operator-ai' }, context)
    ).toMatchObject({ userName: 'AI Assistant', isVirtual: true, operatorKind: 'ai' });
  });

  test('a task the chain cannot cover falls back rather than blanking the row', () => {
    const context = contextOf({
      'u-1': availability({ userUuid: 'u-1', attendanceStatus: 'Absent' }),
    });
    expect(resolveOperationsOwner({ primaryUserUuid: 'u-1' }, context)).toBeNull();
  });

  test('the chain is read off the linked responsibility when the task has none', () => {
    const context = contextOf(
      {
        'u-1': availability({ userUuid: 'u-1', attendanceStatus: 'On Leave' }),
        'u-2': availability({ userUuid: 'u-2', userName: 'Bea' }),
      },
      [{ responsibility_uuid: 'r-1', primaryUserUuid: 'u-1', backup1UserUuid: 'u-2' }]
    );
    expect(resolveOperationsOwner({ responsibility_uuid: 'r-1' }, context)).toMatchObject({
      userName: 'Bea',
    });
  });
});

describe('buildUserWiseAssignedTasks', () => {
  const users = [{ User_name: 'Ana', User_group: 'Office User' }];

  test('an automated owner gets a labelled row of its own', () => {
    const rows = buildUserWiseAssignedTasks({
      users,
      usertaskRows: [
        {
          User: 'Ana',
          resolvedUserName: 'AI Assistant',
          operationsOwner: { userName: 'AI Assistant', isVirtual: true, operatorKind: 'ai' },
        },
      ],
    });
    const ai = rows.find((row) => row.user === 'AI Assistant');
    expect(ai).toMatchObject({ group: 'Automated', automated: true, userTasks: 1, total: 1 });
    // And it is not double-counted against the person it was created for.
    expect(rows.find((row) => row.user === 'Ana')).toMatchObject({ userTasks: 0, total: 0 });
  });

  test('a task covered for someone else is counted on the covering user', () => {
    const rows = buildUserWiseAssignedTasks({
      users: [...users, { User_name: 'Bea', User_group: 'Office User' }],
      usertaskRows: [
        {
          User: 'Ana',
          resolvedUserName: 'Bea',
          operationsOwner: { userName: 'Bea', transferred: true, isVirtual: false },
        },
      ],
    });
    expect(rows.find((row) => row.user === 'Bea')).toMatchObject({ covering: 1, userTasks: 1 });
    expect(rows.find((row) => row.user === 'Ana')).toMatchObject({ userTasks: 0 });
  });

  test('a task with no operations owner still lands on its stored name', () => {
    const rows = buildUserWiseAssignedTasks({
      users,
      usertaskRows: [{ User: 'Ana', resolvedUserName: 'Ana', operationsOwner: null }],
    });
    expect(rows.find((row) => row.user === 'Ana')).toMatchObject({ userTasks: 1, total: 1 });
  });
});
