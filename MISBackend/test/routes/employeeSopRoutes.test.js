const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/sopHandover');
jest.mock('../../src/services/sopService', () => ({
  getDailyStatus: jest.fn(),
  getDailyStatusForUser: jest.fn(),
  markComplete: jest.fn(), markSkipped: jest.fn(), seedDefaultTasks: jest.fn(),
  SOPTask: { find: jest.fn() }, SOPCompletion: {},
}));
jest.mock('../../src/services/employeeSopDayService', () => ({
  getEmployeeDailyStatus: jest.fn(), saveEmployeeCompletion: jest.fn(),
  saveSopHandover: jest.fn(),
}));

const Users = require('../../src/repositories/users');
const {
  getEmployeeDailyStatus, saveEmployeeCompletion, saveSopHandover,
} = require('../../src/services/employeeSopDayService');

process.env.ACCESS_TOKEN_SECRET = 'test-secret';
const app = express();
app.use(express.json());
app.use('/api/sop', require('../../src/routes/sop'));
app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));

const actor = { _id: 'u1', User_uuid: 'emp-1', User_name: 'Asha', User_group: 'Office Design',
  Session_version: 0, permissions: {} };
const token = () => jwt.sign({ id: 'u1', userName: 'Asha', userGroup: 'Office Design', sv: 0 },
  process.env.ACCESS_TOKEN_SECRET);
const post = (path, payload) => request(app).post('/api/sop/' + path)
  .set('Authorization', `Bearer ${token()}`).send(payload);

beforeEach(() => {
  jest.clearAllMocks();
  Users.findById.mockReturnValue({ select: () => ({ lean: async () => actor }) });
  Users.findOne.mockReturnValue({ select: () => ({ lean: async () => actor }) });
  getEmployeeDailyStatus.mockResolvedValue({ tasks: [], canEndDay: true, hasStarted: true });
  saveEmployeeCompletion.mockResolvedValue({ sop_uuid: 'sop-1', employee_uuid: 'emp-1' });
  saveSopHandover.mockResolvedValue({ sop_uuid: 'sop-1', assignedTo: 'Manager' });
});

describe('personal SOP endpoints', () => {
  test('daily/me resolves the logged-in employee rather than an arbitrary group query string', async () => {
    const response = await request(app).get('/api/sop/daily/me?userGroup=Other')
      .set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(200);
    expect(getEmployeeDailyStatus).toHaveBeenCalledWith(expect.objectContaining({
      User_uuid: 'emp-1', User_group: 'Office Design',
    }));
  });

  test('completion ignores a forged userName/userGroup in body', async () => {
    const response = await post('complete', {
      sopUuid: 'sop-1', userName: 'Owner', userGroup: 'Admin',
    });
    expect(response.status).toBe(200);
    expect(saveEmployeeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ User_uuid: 'emp-1', User_name: 'Asha' }), 'sop-1'
    );
  });

  test('optional N/A captures its reason against the authenticated employee', async () => {
    const response = await post('skip', { sopUuid: 'sop-1', skipReason: 'No work today' });
    expect(response.status).toBe(200);
    expect(saveEmployeeCompletion).toHaveBeenCalledWith(actor, 'sop-1', {
      skip: true, reason: 'No work today',
    });
  });

  test('handover records the reason and recipient but does not claim completion', async () => {
    const response = await post('handover', {
      sopUuid: 'sop-1', reason: 'Waiting for customer approval',
      assignedTo: 'Manager', userName: 'Owner',
    });
    expect(response.status).toBe(200);
    expect(saveSopHandover).toHaveBeenCalledWith(actor, 'sop-1', {
      kind: 'handover', reason: 'Waiting for customer approval', assignedTo: 'Manager',
    });
    expect(saveEmployeeCompletion).not.toHaveBeenCalled();
  });

  test('worker cannot inspect colleagues’ exception reasons via manager inbox', async () => {
    const response = await request(app).get('/api/sop/handovers')
      .set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(403);
  });
});
