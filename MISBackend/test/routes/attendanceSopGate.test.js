const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/attendance');
jest.mock('../../src/services/employeeSopDayService', () => ({
  ensureSopClockOut: jest.fn(),
}));

process.env.ACCESS_TOKEN_SECRET = 'test-secret';
process.env.INTERNAL_API_KEY = 'device-key';
const User = require('../../src/repositories/users');
const Attendance = require('../../src/repositories/attendance');
const { ensureSopClockOut } = require('../../src/services/employeeSopDayService');

const app = express();
app.use(express.json());
app.use('/api/attendance', require('../../src/routes/Attendance'));
app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));

const token = () => jwt.sign({ id: 'u1', userName: 'Asha', userGroup: 'Office Admin', sv: 0 }, process.env.ACCESS_TOKEN_SECRET);
let record;
beforeEach(() => {
  jest.clearAllMocks();
  const actor = { _id: 'u1', User_uuid: 'emp-1', User_name: 'Asha',
    User_group: 'Office Admin', Session_version: 0, permissions: {} };
  User.findById.mockReturnValue({ select: () => ({ lean: async () => actor }) });
  User.findOne.mockResolvedValue(actor);
  record = { User: [{ Type: 'In', Time: '09:30', CreatedAt: new Date() }],
    Status: 'Present', save: jest.fn().mockResolvedValue(undefined) };
  Attendance.findOne.mockResolvedValue(record);
  ensureSopClockOut.mockResolvedValue({ canEndDay: true });
});

const punchOut = (extra = {}) => request(app).post('/api/attendance/addAttendance')
  .set('Authorization', `Bearer ${token()}`)
  .send({ User_name: 'Asha', Type: 'Out', Status: 'Completed', Time: '18:00', ...extra });

describe('API-level personal SOP closing gate', () => {
  test('a mandatory pending SOP blocks dashboard Punch Out and does not write attendance', async () => {
    ensureSopClockOut.mockRejectedValue(Object.assign(new Error('Complete SOP'), {
      code: 'SOP_PENDING', status: 409, blockingTasks: [{ sop_uuid: 'cash', title: 'Cash reconciliation' }],
    }));
    const res = await punchOut();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SOP_PENDING');
    expect(res.body.blockingTasks[0].sop_uuid).toBe('cash');
    expect(record.save).not.toHaveBeenCalled();
    expect(record.User).toHaveLength(1);
  });

  test('normal Punch Out succeeds only after the server SOP check', async () => {
    const res = await punchOut();
    expect(res.status).toBe(200);
    expect(ensureSopClockOut).toHaveBeenCalledWith(expect.objectContaining({ User_uuid: 'emp-1' }),
      expect.objectContaining({ source: 'dashboard' }));
    expect(record.User[1].Type).toBe('Out');
    expect(record.save).toHaveBeenCalledTimes(1);
  });

  test('a documented emergency is passed to the server; kiosk cannot forge the exception', async () => {
    const reason = 'Family emergency requiring immediate departure';
    const res = await punchOut({ sopEmergencyReason: reason });
    expect(res.status).toBe(200);
    expect(ensureSopClockOut).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ emergencyReason: reason }));

    jest.clearAllMocks();
    const kiosk = await request(app).post('/api/attendance/addAttendance')
      .set('x-internal-key', 'device-key')
      .send({ User_name: 'Asha', Type: 'Out', Status: 'Completed', Time: '18:00',
        sopEmergencyReason: 'Bypass' });
    expect(kiosk.status).toBe(403);
    expect(ensureSopClockOut).not.toHaveBeenCalled();
  });

  test('setAttendanceState cannot bypass pending SOP with Completed status', async () => {
    ensureSopClockOut.mockRejectedValue(Object.assign(new Error('Complete SOP'), {
      code: 'SOP_PENDING', status: 409, blockingTasks: [],
    }));
    const res = await request(app).post('/api/attendance/setAttendanceState')
      .set('Authorization', `Bearer ${token()}`)
      .send({ User_name: 'Asha', State: 'Completed' });
    expect(res.status).toBe(409);
    expect(record.save).not.toHaveBeenCalled();
  });
});
