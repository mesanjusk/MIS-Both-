// Wiring-level coverage for the operations task service.
//
// The pure tests cover the resolvers; this file covers what sits above them —
// the team-status row assembly and the My Tasks bucketing — with the mongoose
// models mocked, so it runs without a mongod (this environment has no way to
// fetch one, so the repo's DB-backed suites cannot run here).

const state = {
  users: [],
  responsibilities: [],
  tasks: [],
  attendance: [],
  absences: [],
  completions: [],
  settings: {},
};

jest.mock('../../src/repositories/users', () => ({
  find: () => ({
    select: () => ({ lean: async () => state.users }),
    lean: async () => state.users,
  }),
  findOne: () => ({ select: () => ({ lean: async () => state.users[0] || null }) }),
}));

jest.mock('../../src/repositories/responsibility', () => ({
  find: () => ({
    sort: () => ({ lean: async () => state.responsibilities }),
    lean: async () => state.responsibilities,
  }),
  findOne: (query) => ({
    lean: async () =>
      state.responsibilities.find(
        (item) => item.responsibility_uuid === query?.responsibility_uuid
      ) || null,
  }),
}));

jest.mock('../../src/repositories/usertask', () => ({
  find: () => ({
    sort: () => ({ limit: () => ({ lean: async () => state.tasks }) }),
    lean: async () => state.tasks,
  }),
  findOne: () => ({ sort: () => ({ select: () => ({ lean: async () => ({ Usertask_Number: 10 }) }) }) }),
  bulkWrite: jest.fn(async () => ({ modifiedCount: 0 })),
  updateOne: jest.fn(async () => ({})),
  create: jest.fn(async (doc) => doc),
}));

jest.mock('../../src/repositories/attendance', () => ({
  find: () => ({ lean: async () => state.attendance }),
}));

jest.mock('../../src/repositories/AttendanceAbsence', () => ({
  find: () => ({ lean: async () => state.absences }),
}));

jest.mock('../../src/repositories/sopCompletion', () => ({
  find: () => ({ lean: async () => state.completions }),
}));

jest.mock('../../src/repositories/sopTask', () => ({
  find: () => ({ sort: () => ({ lean: async () => [] }) }),
}));

jest.mock('../../src/repositories/operationsAuditLog', () => ({
  create: jest.fn(async () => ({})),
  insertMany: jest.fn(async () => []),
}));

jest.mock('../../src/repositories/appSetting', () => ({
  AppSetting: {
    getSetting: async (key, fallback) =>
      (Object.prototype.hasOwnProperty.call(state.settings, key) ? state.settings[key] : fallback),
    upsertSetting: async () => ({}),
  },
}));

const {
  getTeamStatus, getMyTasks, getDailyReport, resolveOwnerForHook,
} = require('../../src/services/operationsTaskService');

// A Monday inside working hours.
const MONDAY = new Date('2026-08-24T06:00:00.000Z');

const user = (uuid, name, overrides = {}) => ({
  User_uuid: uuid,
  User_name: name,
  User_group: 'Office User',
  operations: {
    priority: overrides.priority || '',
    roleTitle: overrides.roleTitle || '',
    department: '',
    backupEligible: overrides.backupEligible !== false,
    active: overrides.active !== false,
    state: { status: overrides.state || 'Available', currentTask: overrides.currentTask || '' },
  },
});

const presentFor = (uuid) => ({
  Employee_uuid: uuid,
  Date: new Date('2026-08-24T00:00:00.000Z'),
  Status: 'Active',
  User: [{ Type: 'In', Time: '09:25' }],
});

beforeEach(() => {
  state.users = [];
  state.responsibilities = [];
  state.tasks = [];
  state.attendance = [];
  state.absences = [];
  state.completions = [];
  state.settings = {};
});

describe('getTeamStatus', () => {
  test('builds one row per active user, sorted by priority with unprioritised last', async () => {
    state.users = [
      user('u-3', 'Cara', { priority: 'P3' }),
      user('u-1', 'Ana', { priority: 'P1', roleTitle: 'Design Head' }),
      user('u-x', 'Zed'),
      user('u-2', 'Bea', { priority: 'P2' }),
    ];
    state.attendance = state.users.map((entry) => presentFor(entry.User_uuid));

    const { rows } = await getTeamStatus({ date: MONDAY });
    expect(rows.map((row) => row.User_name)).toEqual(['Ana', 'Bea', 'Cara', 'Zed']);
    expect(rows[0]).toMatchObject({ priority: 'P1', roleTitle: 'Design Head', attendanceStatus: 'Present' });
  });

  test('excludes users deactivated in operations without touching their account', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea', { active: false })];
    state.attendance = [presentFor('u-1'), presentFor('u-2')];

    const { rows } = await getTeamStatus({ date: MONDAY });
    expect(rows.map((row) => row.User_name)).toEqual(['Ana']);
  });

  test('counts pending, overdue and covered-for-others tasks per user', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea')];
    state.attendance = [presentFor('u-2')]; // Ana is absent, Bea is in.
    state.tasks = [
      {
        _id: 't1',
        Usertask_name: 'Overdue cover',
        Status: 'Pending',
        Deadline: new Date('2026-08-24T04:00:00.000Z'),
        primaryUserUuid: 'u-1',
        backup1UserUuid: 'u-2',
      },
      {
        _id: 't2',
        Usertask_name: 'Own work',
        Status: 'Pending',
        Deadline: new Date('2026-08-24T18:00:00.000Z'),
        primaryUserUuid: 'u-2',
      },
    ];

    const { rows } = await getTeamStatus({ date: MONDAY });
    const bea = rows.find((row) => row.User_name === 'Bea');
    expect(bea).toMatchObject({ pending: 2, overdue: 1, transferredIn: 1 });
  });

  test('reports an uncovered responsibility as escalated rather than assigning someone', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea'), user('u-p1', 'Senior', { priority: 'P1' })];
    state.attendance = [presentFor('u-p1')]; // only the P1 user is in
    state.responsibilities = [
      {
        responsibility_uuid: 'r-1',
        name: 'Vendor Pickup',
        category: 'outside_logistics',
        isActive: true,
        isCritical: true,
        primaryUserUuid: 'u-1',
        backup1UserUuid: 'u-2',
        backup2UserUuid: '',
      },
    ];

    const { escalated, responsibilities } = await getTeamStatus({ date: MONDAY });
    expect(escalated).toHaveLength(1);
    expect(escalated[0].name).toBe('Vendor Pickup');
    // The available P1 user was not quietly handed the work.
    expect(responsibilities[0].currentOwner).toBeNull();
  });
});

describe('getMyTasks', () => {
  test('sorts open tasks into the overdue / due-soon / waiting buckets', async () => {
    state.users = [user('u-1', 'Ana')];
    state.attendance = [presentFor('u-1')];
    state.tasks = [
      { _id: 'a', Usertask_name: 'Late', Status: 'Pending', Deadline: new Date('2026-08-24T04:00:00.000Z'), primaryUserUuid: 'u-1' },
      { _id: 'b', Usertask_name: 'Soon', Status: 'Pending', Deadline: new Date('2026-08-24T08:00:00.000Z'), primaryUserUuid: 'u-1' },
      { _id: 'c', Usertask_name: 'Held', Status: 'Waiting', Deadline: new Date('2026-08-24T18:00:00.000Z'), primaryUserUuid: 'u-1' },
      { _id: 'd', Usertask_name: 'Running', Status: 'In Progress', Deadline: new Date('2026-08-24T18:00:00.000Z'), primaryUserUuid: 'u-1' },
    ];

    const { buckets } = await getMyTasks({ userUuid: 'u-1', date: MONDAY });
    expect(buckets.overdue.map((task) => task._id)).toEqual(['a']);
    expect(buckets.due_soon.map((task) => task._id)).toEqual(['b']);
    expect(buckets.waiting.map((task) => task._id)).toEqual(['c']);
    expect(buckets.in_progress.map((task) => task._id)).toEqual(['d']);
  });

  test('separates work I inherited from work that is configured to me', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea')];
    state.attendance = [presentFor('u-2')]; // Ana out, Bea in
    state.tasks = [
      { _id: 'own', Usertask_name: 'Mine', Status: 'Pending', Deadline: null, primaryUserUuid: 'u-2' },
      { _id: 'cover', Usertask_name: 'Covering', Status: 'Pending', Deadline: null, primaryUserUuid: 'u-1', backup1UserUuid: 'u-2' },
    ];

    const bea = await getMyTasks({ userUuid: 'u-2', date: MONDAY });
    expect(bea.transferredToMe.map((task) => task._id)).toEqual(['cover']);
    expect(bea.primaryTasks.map((task) => task._id)).toEqual(['own']);

    // And Ana can see that her task is being covered while she is away.
    const ana = await getMyTasks({ userUuid: 'u-1', date: MONDAY });
    expect(ana.coveredForMe.map((task) => task._id)).toEqual(['cover']);
    expect(ana.buckets.overdue.concat(ana.buckets.in_progress)).toEqual([]);
  });

  test('lists the responsibilities I hold right now alongside the configured ones', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea')];
    state.attendance = [presentFor('u-2')];
    state.responsibilities = [
      {
        responsibility_uuid: 'r-1',
        name: 'Packaging',
        category: 'inside_store',
        isActive: true,
        primaryUserUuid: 'u-1',
        backup1UserUuid: 'u-2',
      },
    ];

    const bea = await getMyTasks({ userUuid: 'u-2', date: MONDAY });
    expect(bea.myResponsibilities.configuredBackup.map((item) => item.name)).toEqual(['Packaging']);
    expect(bea.myResponsibilities.configuredPrimary).toEqual([]);
    expect(bea.myResponsibilities.activeNow.map((item) => item.name)).toEqual(['Packaging']);
  });
});

describe('getDailyReport', () => {
  test('counts attendance and task outcomes for the day', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea'), user('u-3', 'Cara')];
    state.attendance = [
      presentFor('u-1'),
      { Employee_uuid: 'u-2', Date: new Date('2026-08-24T00:00:00.000Z'), Status: 'Active', User: [{ Type: 'In', Time: '10:30' }] },
    ];
    state.absences = [{ Employee_uuid: 'u-3', forDate: new Date('2026-08-24T00:00:00.000Z'), reason: 'Sick' }];
    state.tasks = [
      { _id: 'a', Usertask_name: 'Done', Status: 'Completed', Deadline: null, primaryUserUuid: 'u-1' },
      { _id: 'b', Usertask_name: 'Late', Status: 'Pending', Deadline: new Date('2026-08-24T04:00:00.000Z'), primaryUserUuid: 'u-1' },
    ];

    const report = await getDailyReport({ date: MONDAY });
    expect(report.attendance).toMatchObject({ present: 2, late: 1, leave: 1, absent: 0 });
    expect(report.tasks).toMatchObject({ total: 2, completed: 1, pending: 1, overdue: 1 });
  });
});

describe('resolveOwnerForHook', () => {
  const mapDesignHook = (responsibilityUuid) => {
    state.settings.operations_stage_responsibilities = { design_task: responsibilityUuid };
  };

  test('returns null when no responsibility is mapped, leaving existing automation alone', async () => {
    expect(await resolveOwnerForHook('design_task')).toBeNull();
  });

  test('returns null for an unknown hook key', async () => {
    mapDesignHook('r-1');
    expect(await resolveOwnerForHook('some_other_hook')).toBeNull();
  });

  test('resolves the mapped responsibility to its available primary', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea')];
    state.attendance = [presentFor('u-1'), presentFor('u-2')];
    state.responsibilities = [{
      responsibility_uuid: 'r-1',
      name: 'Complex Design',
      category: 'design',
      isActive: true,
      primaryUserUuid: 'u-1',
      backup1UserUuid: 'u-2',
    }];
    mapDesignHook('r-1');

    expect(await resolveOwnerForHook('design_task')).toMatchObject({
      currentOwnerName: 'Ana',
      ownerRole: 'primary',
      escalated: false,
      primaryUserUuid: 'u-1',
      backup1UserUuid: 'u-2',
    });
  });

  test('hands an auto-created task to the backup when the primary is absent', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea')];
    state.attendance = [presentFor('u-2')];
    state.responsibilities = [{
      responsibility_uuid: 'r-1',
      name: 'Complex Design',
      category: 'design',
      isActive: true,
      primaryUserUuid: 'u-1',
      backup1UserUuid: 'u-2',
    }];
    mapDesignHook('r-1');

    expect(await resolveOwnerForHook('design_task')).toMatchObject({
      currentOwnerName: 'Bea',
      ownerRole: 'backup1',
      // The configuration is reported unchanged alongside the runtime owner.
      primaryUserUuid: 'u-1',
    });
  });

  test('reports escalation rather than a name when nobody in the chain is in', async () => {
    state.users = [user('u-1', 'Ana'), user('u-2', 'Bea')];
    state.attendance = [];
    state.responsibilities = [{
      responsibility_uuid: 'r-1',
      name: 'Complex Design',
      category: 'design',
      isActive: true,
      primaryUserUuid: 'u-1',
      backup1UserUuid: 'u-2',
    }];
    mapDesignHook('r-1');

    expect(await resolveOwnerForHook('design_task')).toMatchObject({
      currentOwnerName: '',
      ownerRole: 'escalated',
      escalated: true,
    });
  });
});
