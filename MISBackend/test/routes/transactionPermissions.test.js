/**
 * The accounting routes required a valid JWT and nothing else, so a user with
 * canViewAccounts=false reached every one of them — the audit reproduced a
 * staff DELETE returning 200 and reaching the deletion model.
 *
 * These drive the real router and the real auth/permission middleware with
 * persistence stubbed, which is the shape of that probe.
 */
const express  = require('express');
const request  = require('supertest');
const jwt      = require('jsonwebtoken');

jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/transaction');
jest.mock('../../src/repositories/transactionAudit');
jest.mock('../../src/repositories/accounts');
jest.mock('../../src/repositories/order');
jest.mock('../../src/services/businessWorkflowService', () => ({
  refreshOrderPaymentStatus: jest.fn().mockResolvedValue(undefined),
}));

const Users       = require('../../src/repositories/users');
const Transaction = require('../../src/repositories/transaction');

process.env.ACCESS_TOKEN_SECRET = 'test-secret';

const tokenFor = (userGroup) =>
  jwt.sign({ id: 'u1', userName: 'Staff', userGroup }, process.env.ACCESS_TOKEN_SECRET);

/** The permissions row requirePermission will read for the acting user. */
const mockPermissions = (permissions) => {
  Users.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(permissions === null ? null : { permissions }) }),
  });
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/transactions', require('../../src/routes/Transaction'));
  // Mirror the app's error handler so AppError surfaces as its status code.
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ message: err.message }));
  return app;
};

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
  Transaction.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  Transaction.findOneAndDelete = jest.fn().mockResolvedValue({});
});

describe('accounting routes reject a user denied account access', () => {
  test('DELETE is refused with 403 and never reaches the model', async () => {
    mockPermissions({ canViewAccounts: false });

    const res = await request(app)
      .delete('/api/transactions/some-uuid')
      .set('Authorization', `Bearer ${tokenFor('office user')}`);

    expect(res.status).toBe(403);
    expect(Transaction.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('reads are refused with 403', async () => {
    mockPermissions({ canViewAccounts: false });
    const res = await request(app)
      .get('/api/transactions/')
      .set('Authorization', `Bearer ${tokenFor('office user')}`);
    expect(res.status).toBe(403);
  });

  test('posting is refused with 403', async () => {
    mockPermissions({ canViewAccounts: false });
    const res = await request(app)
      .post('/api/transactions/addTransaction')
      .set('Authorization', `Bearer ${tokenFor('office user')}`)
      .send({ Description: 'x', Transaction_date: '2026-01-01', Payment_mode: 'Cash' });
    expect(res.status).toBe(403);
  });
});

describe('accounting routes separate posting from deleting', () => {
  test('a user who may post but not delete is refused the delete', async () => {
    mockPermissions({ canViewAccounts: true, canPostTransactions: true, canDeleteTransactions: false });

    const res = await request(app)
      .delete('/api/transactions/some-uuid')
      .set('Authorization', `Bearer ${tokenFor('office user')}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/canDeleteTransactions/);
    expect(Transaction.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('a user who may not edit is refused the edit', async () => {
    mockPermissions({ canViewAccounts: true, canEditTransactions: false });
    const res = await request(app)
      .put('/api/transactions/some-uuid')
      .set('Authorization', `Bearer ${tokenFor('office user')}`)
      .send({ Journal_entry: [] });
    expect(res.status).toBe(403);
  });

  test('a delete allowed by permissions proceeds past the guard', async () => {
    mockPermissions({ canViewAccounts: true, canDeleteTransactions: true });
    const res = await request(app)
      .delete('/api/transactions/missing-uuid')
      .set('Authorization', `Bearer ${tokenFor('office user')}`);
    // Past the guard: the route ran and reported the row does not exist.
    expect(res.status).toBe(404);
  });
});

describe('authentication is still required', () => {
  test('no token is rejected with 401', async () => {
    const res = await request(app).get('/api/transactions/');
    expect(res.status).toBe(401);
  });
});
