// The authentication boundary on the core operational endpoints.
//
// Orders, transactions (receipts and payments) and delivery updates are where
// money and commitments are recorded. This file pins that none of them can be
// reached without a session, and that the guard sits at the router so a new
// route added to one of these files inherits it rather than having to remember.
//
// Models are mocked so this runs without a mongod. Every assertion below is
// decided in middleware, before any query would run.

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.ACCESS_TOKEN_SECRET = 'test-secret-not-a-real-key';

const { errorHandler } = require('../../src/middleware/errorHandler');

const tokenFor = (userGroup = 'Office User') =>
  jwt.sign({ id: 'u-1', userName: 'tester', userGroup }, process.env.ACCESS_TOKEN_SECRET);

/** Does this router refuse an anonymous request to `path`? */
const expectRejectsAnonymous = async (app, method, path, body) => {
  const res = await request(app)[method](path).send(body || {});
  expect(res.status).toBe(401);
};

describe('order endpoints require a session', () => {
  const ordersRouter = require('../../src/routes/Order');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRouter);
  app.use(errorHandler);

  test('creating an order anonymously is refused', async () => {
    await expectRejectsAnonymous(app, 'post', '/api/orders/addOrder', {
      Customer_uuid: 'c-1',
      Items: [],
    });
  });

  test('updating a delivery anonymously is refused', async () => {
    await expectRejectsAnonymous(app, 'put', '/api/orders/updateDelivery/abc', {
      Customer_uuid: 'c-1',
    });
  });

  test('reading orders anonymously is refused', async () => {
    await expectRejectsAnonymous(app, 'get', '/api/orders/GetOrderList');
  });

  test('an expired or forged token is refused like no token at all', async () => {
    const res = await request(app)
      .put('/api/orders/updateDelivery/abc')
      .set('Authorization', 'Bearer forged.token.value')
      .send({ Customer_uuid: 'c-1' });
    expect(res.status).toBe(401);
  });

  test('a token signed with the wrong secret is refused', async () => {
    const wrong = jwt.sign({ id: 'u-1', userGroup: 'Admin User' }, 'a-different-secret');
    const res = await request(app)
      .put('/api/orders/updateDelivery/abc')
      .set('Authorization', `Bearer ${wrong}`)
      .send({ Customer_uuid: 'c-1' });
    expect(res.status).toBe(401);
  });

  test('a valid session gets past the guard (not a 401)', async () => {
    // What happens after the guard is the route's business and needs a
    // database; all that is asserted here is that authentication passed.
    const res = await request(app)
      .put('/api/orders/updateDelivery/abc')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).not.toBe(401);
  });
});

describe('transaction endpoints (receipts and payments) require a session', () => {
  const transactionRouter = require('../../src/routes/Transaction');
  const app = express();
  app.use(express.json());
  app.use('/api/transactions', transactionRouter);
  app.use(errorHandler);

  test('recording a transaction anonymously is refused', async () => {
    await expectRejectsAnonymous(app, 'post', '/api/transactions/addTransaction', {
      Description: 'cash receipt',
      Total_Credit: 500,
    });
  });

  test('editing a transaction anonymously is refused', async () => {
    await expectRejectsAnonymous(app, 'put', '/api/transactions/some-uuid', { Description: 'x' });
  });

  test('deleting a transaction anonymously is refused', async () => {
    await expectRejectsAnonymous(app, 'delete', '/api/transactions/some-uuid');
  });

  test('a forged token cannot record money', async () => {
    const res = await request(app)
      .post('/api/transactions/addTransaction')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ Description: 'cash receipt' });
    expect(res.status).toBe(401);
  });
});

describe('attendance requires a session or the internal device key', () => {
  const attendanceRouter = require('../../src/routes/Attendance');
  const app = express();
  app.use(express.json());
  app.use('/api/attendance', attendanceRouter);
  app.use(errorHandler);

  test('marking attendance anonymously is refused', async () => {
    await expectRejectsAnonymous(app, 'post', '/api/attendance/addAttendance', {
      User_name: 'someone',
      Type: 'In',
      Status: 'Active',
      Time: '09:30',
    });
  });

  test('a forged token cannot mark attendance for someone', async () => {
    // Regression test. The guard used to check only that an Authorization
    // header *existed* and then call next(), so `Bearer x` was accepted
    // unverified — anyone reaching the API could mark attendance for any
    // employee. Attendance drives the Operations fallback, so a forged mark
    // moves who owns work for the rest of the day.
    const res = await request(app)
      .post('/api/attendance/addAttendance')
      .set('Authorization', 'Bearer forged')
      .send({ User_name: 'someone', Type: 'In', Status: 'Active', Time: '09:30' });
    expect(res.status).toBe(401);
  });

  test('an arbitrary internal key is refused, not trusted for being present', async () => {
    const res = await request(app)
      .post('/api/attendance/addAttendance')
      .set('x-internal-key', 'guessed-value')
      .send({ User_name: 'someone', Type: 'In', Status: 'Active', Time: '09:30' });
    expect([401, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('the device key is verified against the configured value', async () => {
    const previous = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = 'the-real-device-key';
    try {
      const wrong = await request(app)
        .post('/api/attendance/addAttendance')
        .set('x-internal-key', 'not-the-real-key')
        .send({ User_name: 'someone', Type: 'In', Status: 'Active', Time: '09:30' });
      expect(wrong.status).toBe(401);

      // The correct key gets past authentication; what follows needs a database.
      const right = await request(app)
        .post('/api/attendance/addAttendance')
        .set('x-internal-key', 'the-real-device-key')
        .send({ User_name: 'someone', Type: 'In', Status: 'Active', Time: '09:30' });
      expect(right.status).not.toBe(401);
    } finally {
      if (previous === undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY = previous;
    }
  });

  test('a valid session gets past authentication', async () => {
    const res = await request(app)
      .post('/api/attendance/addAttendance')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ User_name: 'someone', Type: 'In', Status: 'Active', Time: '09:30' });
    expect(res.status).not.toBe(401);
  });
});

describe('the guard is mounted router-wide, not per route', () => {
  // A per-route guard is one someone forgets on the next route they add.
  const fs = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../src', p), 'utf8');

  test.each([
    ['routes/Order/index.js'],
    ['routes/Transaction.js'],
    ['routes/Operations.js'],
  ])('%s applies requireAuth with router.use', (file) => {
    expect(read(file)).toMatch(/router\.use\(requireAuth\)/);
  });
});
