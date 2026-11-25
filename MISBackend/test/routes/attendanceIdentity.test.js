/**
 * The JWT-authenticated attendance endpoints took User_name from the request
 * body with nothing tying it to the caller, so any member of staff could mark
 * — or change the state of — someone else's attendance. Attendance decides who
 * the Operations fallback treats as available, so a forged mark reassigns work
 * as well as a timesheet.
 *
 * The shared-device flow authenticates with INTERNAL_API_KEY precisely so one
 * device can mark for everybody, and is deliberately unaffected.
 */
const express = require('express');
const request = require('supertest');
const jwt     = require('jsonwebtoken');

jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/attendance');
jest.mock('../../src/services/attendanceService', () => ({
  ...jest.requireActual('../../src/services/attendanceService'),
  submitAttendance: jest.fn().mockResolvedValue({ success: true }),
}));

const Users = require('../../src/repositories/users');

process.env.ACCESS_TOKEN_SECRET = 'test-secret';
process.env.INTERNAL_API_KEY = 'device-key';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/attendance', require('../../src/routes/Attendance'));
app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));

/** A token for a live account with the given name and role. */
const tokenFor = (userName, userGroup = 'worker') => {
  Users.findById.mockReturnValue({
    select: () => ({ lean: async () => ({
      _id: 'u1', User_name: userName, User_group: userGroup, Session_version: 0, permissions: {},
    }) }),
  });
  return jwt.sign({ id: 'u1', userName, userGroup, sv: 0 }, process.env.ACCESS_TOKEN_SECRET);
};

const mark = (token, User_name) =>
  request(app)
    .post('/api/attendance/addAttendance')
    .set('Authorization', `Bearer ${token}`)
    .send({ User_name, Type: 'In', Status: 'Present', Time: '09:30' });

beforeEach(() => jest.clearAllMocks());

describe('marking attendance for someone else', () => {
  test('a worker cannot mark another employee', async () => {
    const res = await mark(tokenFor('Ramesh'), 'Suresh');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/your own attendance/i);
  });

  test('a worker can mark themselves', async () => {
    const res = await mark(tokenFor('Ramesh'), 'Ramesh');
    expect(res.status).not.toBe(403);
  });

  test('the name comparison ignores case and surrounding spaces', async () => {
    const res = await mark(tokenFor('Ramesh'), '  ramesh ');
    expect(res.status).not.toBe(403);
  });

  test('a manager may mark on behalf of their staff', async () => {
    const res = await mark(tokenFor('Priya', 'manager'), 'Suresh');
    expect(res.status).not.toBe(403);
  });

  test('an admin may mark on behalf of their staff', async () => {
    const res = await mark(tokenFor('Owner', 'admin'), 'Suresh');
    expect(res.status).not.toBe(403);
  });

  test('the shared device key still marks for anybody', async () => {
    const res = await request(app)
      .post('/api/attendance/addAttendance')
      .set('x-internal-key', 'device-key')
      .send({ User_name: 'Suresh', Type: 'In', Status: 'Present', Time: '09:30' });

    expect(res.status).not.toBe(403);
  });

  test('an unauthenticated request is still refused', async () => {
    const res = await request(app)
      .post('/api/attendance/addAttendance')
      .send({ User_name: 'Suresh', Type: 'In', Status: 'Present', Time: '09:30' });

    expect(res.status).toBe(401);
  });
});

describe('changing someone else\'s attendance state', () => {
  const setState = (token, User_name) =>
    request(app)
      .post('/api/attendance/setAttendanceState')
      .set('Authorization', `Bearer ${token}`)
      .send({ User_name, State: 'Out' });

  test('a worker cannot change another employee\'s state', async () => {
    const res = await setState(tokenFor('Ramesh'), 'Suresh');
    expect(res.status).toBe(403);
  });

  test('the endpoint now requires a session at all', async () => {
    const res = await request(app)
      .post('/api/attendance/setAttendanceState')
      .send({ User_name: 'Suresh', State: 'Out' });
    expect(res.status).toBe(401);
  });
});

describe('office network for starting your own day', () => {
  beforeEach(() => { process.env.OFFICE_ATTENDANCE_IPS = '192.0.2.14'; });
  afterEach(() => { delete process.env.OFFICE_ATTENDANCE_IPS; });

  const punch = (address, type = 'In', user = 'Ramesh', token = tokenFor('Ramesh')) =>
    request(app).post('/api/attendance/addAttendance')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', address)
      .send({ User_name: user, Type: type, Status: 'Present', Time: '09:30' });

  test('rejects a self check-in seen from outside the office', async () => {
    const res = await punch('192.0.2.14, 192.0.2.99');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OFFICE_NETWORK_REQUIRED');
    expect(Users.findOne).not.toHaveBeenCalled();
  });

  test('allows the configured network, including an IPv4-mapped address', async () => {
    Users.findOne.mockResolvedValue(null);
    expect((await punch('::ffff:192.0.2.14')).status).toBe(404);
  });

  test('allows clock-out, vendor punches and manager punches on behalf of staff off-site', async () => {
    Users.findOne.mockResolvedValue(null);
    expect((await punch('192.0.2.99', 'Out')).status).toBe(404);
    expect((await punch('192.0.2.99', 'In', 'Ramesh', tokenFor('Priya', 'manager'))).status).toBe(404);
    expect((await punch('192.0.2.99', 'In', 'Ramesh', tokenFor('Ramesh', 'Vendor'))).status).toBe(404);
  });

  test('on Render uses ingress visitor headers and fails closed when they disagree or are missing', async () => {
    process.env.RENDER = 'true';
    try {
      Users.findOne.mockResolvedValue(null);
      expect((await punch('192.0.2.14')).body.code).toBe('OFFICE_NETWORK_REQUIRED');
      const proxied = (ip) => punch('192.0.2.99')
        .set('Rndr-Id', 'proxy-id')
        .set('True-Client-IP', '192.0.2.14')
        .set('CF-Connecting-IP', ip);
      expect((await proxied('192.0.2.99')).body.code).toBe('OFFICE_NETWORK_REQUIRED');
      expect((await proxied('192.0.2.14')).status).toBe(404);
    } finally {
      delete process.env.RENDER;
    }
  });
});
