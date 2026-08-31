// Who may create, modify and delete user accounts.
//
// These endpoints previously required only a valid token. Since the request
// body carries `User_group` unrestricted, any logged-in staff member could
// create an Admin account, promote themselves, or reset another user's
// password — a full privilege escalation from the lowest role in the system.
//
// The models are mocked so this runs without a mongod (this environment cannot
// fetch one). That costs nothing here: every rejection asserted below happens
// in middleware, before any query is issued.

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.ACCESS_TOKEN_SECRET = 'test-secret-not-a-real-key';

const savedUsers = [];

jest.mock('../../src/repositories/users', () => {
  function Users(doc) { Object.assign(this, doc); }
  Users.prototype.save = jest.fn(async function save() { savedUsers.push({ ...this }); return this; });
  Users.findOne = jest.fn(async () => null);
  Users.find = jest.fn(() => ({ select: () => ({ lean: async () => [] }) }));
  Users.findById = jest.fn(() => ({ select: () => ({ lean: async () => null }) }));
  Users.findByIdAndUpdate = jest.fn(() => ({ select: async () => null }));
  Users.findOneAndUpdate = jest.fn(() => ({ select: async () => null }));
  Users.findOneAndDelete = jest.fn(async () => null);
  return Users;
});
jest.mock('../../src/repositories/order', () => ({ distinct: async () => [] }));
jest.mock('../../src/repositories/transaction', () => ({ distinct: async () => [] }));
jest.mock('../../src/utils/mobileVisibility', () => ({ maskMobileNumbers: async () => {} }));
// The real limiter allows 5 requests per 5 minutes, which several tests in one
// file would trip. Rate limiting is not what this file is testing.
jest.mock('../../src/middleware/rateLimit', () => ({
  authLimiter: (_req, _res, next) => next(),
  generalLimiter: (_req, _res, next) => next(),
  whatsappLimiter: (_req, _res, next) => next(),
  createRateLimiter: () => (_req, _res, next) => next(),
}));

const usersRouter = require('../../src/routes/Users');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);
app.use(errorHandler);

const tokenFor = (userGroup) =>
  jwt.sign({ id: 'u-1', userName: 'tester', userGroup }, process.env.ACCESS_TOKEN_SECRET);

const NEW_USER = {
  User_name: 'someone',
  Password: 'a-long-enough-password',
  Mobile_number: '9000000000',
  User_group: 'Admin User',
};

beforeEach(() => {
  savedUsers.length = 0;
  jest.clearAllMocks();
});

describe('user creation is closed to the public and to ordinary staff', () => {
  test('there is no registration endpoint to call', async () => {
    const res = await request(app).post('/api/users/register').send(NEW_USER);
    // 404, not 401: the endpoint does not exist at all. If this ever starts
    // returning 401 or 403, a registration route has been added — which is the
    // thing this release removed.
    expect(res.status).toBe(404);
  });

  test('an unauthenticated request cannot create a user', async () => {
    const res = await request(app).post('/api/users/addUser').send(NEW_USER);
    expect(res.status).toBe(401);
    expect(savedUsers).toHaveLength(0);
  });

  test('a request with a junk token cannot create a user', async () => {
    const res = await request(app)
      .post('/api/users/addUser')
      .set('Authorization', 'Bearer not-a-real-token')
      .send(NEW_USER);
    expect(res.status).toBe(401);
    expect(savedUsers).toHaveLength(0);
  });

  test.each(['Office User', 'worker', 'delivery', 'manager', 'Office Admin'])(
    'ordinary staff (%s) cannot create a user',
    async (role) => {
      const res = await request(app)
        .post('/api/users/addUser')
        .set('Authorization', `Bearer ${tokenFor(role)}`)
        .send(NEW_USER);
      expect(res.status).toBe(403);
      expect(savedUsers).toHaveLength(0);
    }
  );

  test.each(['Admin User', 'admin', 'owner', 'Owner'])(
    '%s can still use Add User',
    async (role) => {
      const res = await request(app)
        .post('/api/users/addUser')
        .set('Authorization', `Bearer ${tokenFor(role)}`)
        .send(NEW_USER);
      expect(res.status).toBe(201);
      expect(savedUsers).toHaveLength(1);
      expect(savedUsers[0].User_name).toBe('someone');
    }
  );

  test('the stored password is hashed, never the plaintext that was posted', async () => {
    await request(app)
      .post('/api/users/addUser')
      .set('Authorization', `Bearer ${tokenFor('Admin User')}`)
      .send(NEW_USER);
    expect(savedUsers).toHaveLength(1);
    expect(savedUsers[0].Password).not.toBe(NEW_USER.Password);
    expect(savedUsers[0].Password).toEqual(expect.any(String));
  });
});

describe('the other account-privilege endpoints carry the same guard', () => {
  // Each of these can set User_group, so leaving any one of them on plain
  // requireAuth would reopen the escalation that closing /addUser shuts.
  const cases = [
    ['put', '/api/users/updateUser/abc'],
    ['put', '/api/users/update/abc'],
    ['put', '/api/users/updateUserPermissions/abc'],
    ['delete', '/api/users/DeleteUser/abc'],
  ];

  test.each(cases)('%s %s rejects an ordinary staff token', async (method, path) => {
    const res = await request(app)[method](path)
      .set('Authorization', `Bearer ${tokenFor('Office User')}`)
      .send({ User_group: 'Admin User', permissions: {} });
    expect(res.status).toBe(403);
  });

  test.each(cases)('%s %s rejects an unauthenticated request', async (method, path) => {
    const res = await request(app)[method](path).send({ User_group: 'Admin User', permissions: {} });
    expect(res.status).toBe(401);
  });
});

describe('login stays reachable without a token', () => {
  test('POST /login is not behind the admin guard', async () => {
    const res = await request(app).post('/api/users/login').send({ User_name: 'x', Password: 'y' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
