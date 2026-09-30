const express = require('express');
const request = require('supertest');

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', userName: 'Admin' }; next(); },
}));
jest.mock('../../src/middleware/authorize', () => ({
  requireAdmin: (_req, _res, next) => next(),
}));
jest.mock('../../src/repositories/responsibility');
jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/sopHandover');
jest.mock('../../src/services/employeeSopDayService', () => ({
  getEmployeeDailyStatus: jest.fn(), saveEmployeeCompletion: jest.fn(), saveSopHandover: jest.fn(),
}));
jest.mock('../../src/services/sopService', () => ({
  getDailyStatus: jest.fn(), getDailyStatusForUser: jest.fn(), markComplete: jest.fn(),
  markSkipped: jest.fn(), seedDefaultTasks: jest.fn(),
  SOPTask: {
    create: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(),
    find: jest.fn(), findByIdAndDelete: jest.fn(),
  },
  SOPCompletion: { deleteMany: jest.fn() },
}));

const Responsibility = require('../../src/repositories/responsibility');
const { SOPTask } = require('../../src/services/sopService');
const app = express();
app.use(express.json());
app.use('/api/sop', require('../../src/routes/sop'));

const linked = {
  responsibility_uuid: 'resp-design',
  name: 'Design Proofs',
  isActive: true,
  primaryUserUuid: 'emp-1',
  backup1UserUuid: 'emp-2',
  backup2UserUuid: 'emp-3',
  backup3UserUuid: 'emp-4',
  backup4UserUuid: 'emp-5',
};

beforeEach(() => {
  jest.clearAllMocks();
  Responsibility.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(linked) });
  SOPTask.create.mockImplementation(async (row) => ({ _id: 'task-1', ...row }));
});

describe('SOP Responsibility assignment', () => {
  test('creates an employee-owned SOP with no duplicate required group and clears direct slot overrides', async () => {
    const response = await request(app).post('/api/sop/tasks').send({
      title: 'Send customer proof',
      responsibility_uuid: 'resp-design',
      primaryGroup: '',
      primaryUserUuid: 'stale-employee',
      backup1UserUuid: 'stale-backup',
      frequency: 'daily',
    });
    expect(response.status).toBe(201);
    expect(Responsibility.findOne).toHaveBeenCalledWith({
      responsibility_uuid: 'resp-design', isActive: true,
    });
    expect(SOPTask.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Send customer proof',
      responsibility_uuid: 'resp-design',
      primaryGroup: '',
      primaryUserUuid: '',
      backup1UserUuid: '',
      backup2UserUuid: '',
      backup3UserUuid: '',
      backup4UserUuid: '',
    }));
  });

  test('keeps legacy group-owned SOP creation unchanged when no Responsibility is selected', async () => {
    const response = await request(app).post('/api/sop/tasks').send({
      title: 'Check inbox', primaryGroup: 'Office Admin',
      fallbackGroups: ['Office Marketing'], frequency: 'daily',
    });
    expect(response.status).toBe(201);
    expect(Responsibility.findOne).not.toHaveBeenCalled();
    expect(SOPTask.create).toHaveBeenCalledWith(expect.objectContaining({
      primaryGroup: 'Office Admin', fallbackGroups: ['Office Marketing'],
      responsibility_uuid: '',
    }));
  });

  test('rejects an unknown/inactive Responsibility instead of silently creating an unowned SOP', async () => {
    Responsibility.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const response = await request(app).post('/api/sop/tasks').send({
      title: 'Final file backup', responsibility_uuid: 'missing-responsibility',
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/active Responsibility/i);
    expect(SOPTask.create).not.toHaveBeenCalled();
  });

  test('editing to a Responsibility preserves the live chain rather than copying employee UUIDs', async () => {
    SOPTask.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'task-1', title: 'Final file backup', primaryGroup: 'Office Design',
      responsibility_uuid: '', primaryUserUuid: 'old-direct-owner',
    }) });
    SOPTask.findByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: 'task-1', title: 'Final file backup', responsibility_uuid: 'resp-design',
    }) });

    const response = await request(app).put('/api/sop/tasks/task-1').send({
      responsibility_uuid: 'resp-design', primaryGroup: '',
    });
    expect(response.status).toBe(200);
    expect(SOPTask.findByIdAndUpdate).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        responsibility_uuid: 'resp-design', primaryGroup: '',
        primaryUserUuid: '', backup1UserUuid: '', backup2UserUuid: '',
        backup3UserUuid: '', backup4UserUuid: '',
      }),
      { new: true, runValidators: true },
    );
  });
});
