jest.mock('../../src/repositories/sopTask');
jest.mock('../../src/repositories/sopCompletion');
jest.mock('../../src/repositories/attendance');
jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/responsibility');
jest.mock('../../src/services/operationsService', () => ({
  buildAvailabilityMap: jest.fn(),
  isAvailableFor: jest.fn(),
}));

const SOPTask = require('../../src/repositories/sopTask');
const SOPCompletion = require('../../src/repositories/sopCompletion');
const User = require('../../src/repositories/users');
const Responsibility = require('../../src/repositories/responsibility');
const { buildAvailabilityMap, isAvailableFor } = require('../../src/services/operationsService');
const { getDailyStatusForUser } = require('../../src/services/sopService');

const query = (value) => ({
  sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
});
const lean = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

beforeEach(() => {
  jest.clearAllMocks();
  SOPTask.find.mockReturnValue(query([{
    sop_uuid: 'sop-proof',
    title: 'Send proof',
    frequency: 'daily',
    isActive: true,
    category: 'design',
    responsibility_uuid: 'resp-design',
    primaryUserUuid: '',
    backup1UserUuid: '',
    backup2UserUuid: '',
    backup3UserUuid: '',
    backup4UserUuid: '',
  }]));
  User.find.mockReturnValue({
    select: jest.fn().mockReturnValue(lean([
      { User_uuid: 'emp-primary', User_name: 'Maahi' },
      { User_uuid: 'emp-backup', User_name: 'Harshita' },
    ])),
  });
  Responsibility.find.mockReturnValue(lean([{
    responsibility_uuid: 'resp-design',
    name: 'Customer Design Proof',
    category: 'design',
    primaryUserUuid: 'emp-primary',
    backup1UserUuid: 'emp-backup',
    backup2UserUuid: '',
    backup3UserUuid: '',
    backup4UserUuid: '',
  }]));
  SOPCompletion.find.mockReturnValue(lean([]));
  buildAvailabilityMap.mockResolvedValue(new Map([
    ['emp-primary', { userName: 'Maahi', backupEligible: true }],
    ['emp-backup', { userName: 'Harshita', backupEligible: true }],
  ]));
  isAvailableFor.mockImplementation((availability) => ({
    available: availability.userName === 'Harshita',
    reason: availability.userName === 'Harshita' ? 'Available' : 'Absent',
  }));
});

describe('SOP effective responsibility owner', () => {
  test('backup employee receives the SOP with Responsibility and effective owner metadata', async () => {
    const status = await getDailyStatusForUser('emp-backup');
    expect(status.tasks).toHaveLength(1);
    expect(status.tasks[0]).toMatchObject({
      responsibility_uuid: 'resp-design',
      responsibilityName: 'Customer Design Proof',
      ownerRole: 'backup1',
      transferred: true,
      effectiveOwner: {
        userUuid: 'emp-backup',
        userName: 'Harshita',
        role: 'backup1',
      },
    });
  });

  test('unavailable primary does not continue seeing the SOP after ownership falls to Backup 1', async () => {
    const status = await getDailyStatusForUser('emp-primary');
    expect(status.tasks).toEqual([]);
  });

  test('when Primary is available, the checklist identifies Primary as the effective owner', async () => {
    isAvailableFor.mockImplementation((availability) => ({
      available: availability.userName === 'Maahi',
      reason: availability.userName === 'Maahi' ? 'Available' : 'Busy',
    }));
    const status = await getDailyStatusForUser('emp-primary');
    expect(status.tasks[0]).toMatchObject({
      transferred: false,
      ownerRole: 'primary',
      responsibilityName: 'Customer Design Proof',
      effectiveOwner: { userName: 'Maahi', role: 'primary' },
    });
  });
});
