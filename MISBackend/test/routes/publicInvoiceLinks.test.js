/**
 * Shared invoice and receipt links stored expiresAt but the public read never
 * checked it, and there was no TTL index behind it — so every link issued was
 * effectively permanent. Invoice content, including the UPI payee, was taken
 * from the request body by any authenticated caller.
 */
const express = require('express');
const request = require('supertest');
const jwt     = require('jsonwebtoken');

jest.mock('../../src/repositories/publicInvoice');
jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/transaction');
jest.mock('../../src/repositories/order');
jest.mock('../../src/repositories/appSetting', () => ({
  AppSetting: {
    getSetting: jest.fn().mockResolvedValue({
      name: 'S.K. Digital', upiId: 'business@upi', upiName: 'S.K. Digital', phone: '111',
    }),
  },
}));

const PublicInvoice = require('../../src/repositories/publicInvoice');
const Users         = require('../../src/repositories/users');
const Transaction   = require('../../src/repositories/transaction');

process.env.ACCESS_TOKEN_SECRET = 'test-secret';

const token = jwt.sign({ id: 'u1', userName: 'Staff', userGroup: 'office user', sv: 0 },
  process.env.ACCESS_TOKEN_SECRET);

const app = express();
app.use(express.json());
app.use('/api/public-invoice', require('../../src/routes/PublicInvoice'));
app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));

beforeEach(() => {
  jest.clearAllMocks();
  Users.findById.mockReturnValue({
    select: () => ({ lean: async () => ({
      _id: 'u1', User_name: 'Staff', User_group: 'office user', Session_version: 0, permissions: {},
    }) }),
  });
});

/**
 * findOneAndUpdate is awaited directly on one route and chained with .lean() on
 * another, so the stub has to answer to both.
 */
const mockSaved = (doc) => {
  PublicInvoice.findOneAndUpdate.mockReturnValue(
    Object.assign(Promise.resolve(doc), { lean: () => Promise.resolve(doc) })
  );
};

/** What the public read will find for a share token. */
const mockDoc = (doc) => {
  PublicInvoice.findOne.mockReturnValue({ lean: async () => doc });
};

describe('a shared link stops working when it lapses', () => {
  test('an expired link is refused with an explicit expiry response', async () => {
    mockDoc({ shareToken: 't', grandTotal: 500, expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).get('/api/public-invoice/p/t');

    expect(res.status).toBe(410);
    expect(res.body.expired).toBe(true);
    // The figures must not come back with it.
    expect(res.body.result).toBeUndefined();
  });

  test('a withdrawn link is refused', async () => {
    mockDoc({ shareToken: 't', expiresAt: new Date(Date.now() + 1000), revokedAt: new Date() });

    const res = await request(app).get('/api/public-invoice/p/t');
    expect(res.status).toBe(410);
    expect(res.body.revoked).toBe(true);
  });

  test('a live link still resolves', async () => {
    mockDoc({ shareToken: 't', grandTotal: 500, expiresAt: new Date(Date.now() + 60_000) });

    const res = await request(app).get('/api/public-invoice/p/t');
    expect(res.status).toBe(200);
    expect(res.body.result.grandTotal).toBe(500);
  });

  test('an unknown token is still a 404, not a 410', async () => {
    mockDoc(null);
    const res = await request(app).get('/api/public-invoice/p/t');
    expect(res.status).toBe(404);
  });
});

describe('shared documents are built from server-held records', () => {
  test('the UPI payee comes from the business profile, not the request', async () => {
    mockSaved({ shareToken: 'new-token' });

    const res = await request(app)
      .post('/api/public-invoice/')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderNumber: '42',
        upiId: 'attacker@upi',      // ignored
        upiName: 'Attacker',        // ignored
        storeName: 'Not The Business',
        items: [], grandTotal: 1000,
      });

    expect(res.status).toBe(200);
    const [, written] = PublicInvoice.findOneAndUpdate.mock.calls[0];
    expect(written.upiId).toBe('business@upi');
    expect(written.upiName).toBe('S.K. Digital');
    expect(written.storeName).toBe('S.K. Digital');
  });

  test('receipt figures come from the transaction, not the request', async () => {
    Transaction.findOne.mockReturnValue({
      lean: async () => ({
        Transaction_uuid: 'txn-1', Transaction_id: 77, Total_Debit: 250, Total_Credit: 250,
        Payment_mode: 'Cash', Order_number: 42, Transaction_date: new Date('2026-09-01'),
      }),
    });
    mockSaved({ shareToken: 'r-token' });

    const res = await request(app)
      .post('/api/public-invoice/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionUuid: 'txn-1', amount: 99999, paymentMode: 'Bank', transactionId: '1' });

    expect(res.status).toBe(200);
    const [, written] = PublicInvoice.findOneAndUpdate.mock.calls[0];
    expect(written.amount).toBe(250);
    expect(written.grandTotal).toBe(250);
    expect(written.paymentMode).toBe('Cash');
    expect(written.transactionId).toBe('77');
  });

  test('a receipt for a transaction that does not exist is refused', async () => {
    Transaction.findOne.mockReturnValue({ lean: async () => null });

    const res = await request(app)
      .post('/api/public-invoice/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionUuid: 'nope', amount: 500 });

    expect(res.status).toBe(404);
    expect(PublicInvoice.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a user denied posting cannot create a shared document', async () => {
    Users.findById.mockReturnValue({
      select: () => ({ lean: async () => ({
        _id: 'u1', User_name: 'Staff', User_group: 'office user', Session_version: 0,
        permissions: { canPostTransactions: false },
      }) }),
    });

    const res = await request(app)
      .post('/api/public-invoice/')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: '42', items: [], grandTotal: 1000 });

    expect(res.status).toBe(403);
    expect(PublicInvoice.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
