const express = require('express');
const request = require('supertest');

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', userName: 'Accounts Staff' }; next(); },
  requireInternalKey: (_req, _res, next) => next(),
}));
jest.mock('../../src/middleware/requirePermission', () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));
jest.mock('../../src/repositories/paymentFollowup');
jest.mock('../../src/repositories/customer');
jest.mock('../../src/services/sanjuskApiService', () => ({
  sendTemplate: jest.fn(),
}));
jest.mock('../../src/services/paymentFollowupLedgerService', () => ({
  getReceivableBalances: jest.fn(),
  enrichFollowups: jest.fn(),
  money: (value) => Math.round((Number(value) || 0) * 100) / 100,
  indiaDay: (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
}));

const Customer = require('../../src/repositories/customer');
const Followup = require('../../src/repositories/paymentFollowup');
const sanjusk = require('../../src/services/sanjuskApiService');
const ledger = require('../../src/services/paymentFollowupLedgerService');
const id = '507f1f77bcf86cd799439011';
const customer = { Customer_uuid: 'customer-1', Customer_name: 'Customer One', Mobile_number: '9876543210' };

const app = express();
app.use(express.json());
app.use('/api/paymentfollowup', require('../../src/routes/paymentFollowup'));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.PAYMENT_FOLLOWUP_BULK_REMINDERS_ENABLED;
  Customer.findOne.mockReturnValue({ lean: () => Promise.resolve(customer) });
  Followup.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  ledger.getReceivableBalances.mockResolvedValue(new Map([['customer-1', 2500]]));
});

describe('payment follow-up V2 API', () => {
  test('uses a verified customer UUID and ledger snapshot for new follow-ups', async () => {
    Followup.create.mockImplementation(async (row) => ({ _id: id, ...row }));
    const response = await request(app).post('/api/paymentfollowup/add').send({
      Customer: 'Customer One', Customer_uuid: 'customer-1', Amount: 1000,
      Followup_date: '2026-09-29', Assigned_to: 'Asha', Promised_date: '2026-10-01',
    });
    expect(response.status).toBe(201);
    expect(response.body.result).toMatchObject({
      customer_uuid: 'customer-1', baseline_outstanding: 2500,
      amount: 1000, assigned_to: 'Asha',
    });
    expect(Followup.create.mock.calls[0][0].history[0].action).toBe('created');
  });

  test('refuses a follow-up larger than real receivables', async () => {
    const response = await request(app).post('/api/paymentfollowup/add').send({
      Customer: 'Customer One', Customer_uuid: 'customer-1', Amount: 5000,
    });
    expect(response.status).toBe(400);
    expect(Followup.create).not.toHaveBeenCalled();
  });

  test('returns derived settlement status before filtering the list', async () => {
    const query = { lean: () => Promise.resolve([{ _id: id }]) };
    query.limit = () => query; // Mongoose mutates and returns its own query.
    Followup.find.mockReturnValue({ sort: () => query });
    ledger.enrichFollowups.mockResolvedValue([
      { _id: id, status: 'pending', effectiveStatus: 'done', autoSettled: true },
    ]);
    const response = await request(app).get('/api/paymentfollowup/list?status=done&limit=50');
    expect(response.status).toBe(200);
    expect(response.body.result).toEqual([
      expect.objectContaining({ effectiveStatus: 'done', autoSettled: true }),
    ]);
  });

  test('never sends a paid WhatsApp message without explicit confirmation', async () => {
    const response = await request(app).post('/api/paymentfollowup/' + id + '/send-reminder')
      .send({});
    expect(response.status).toBe(400);
    expect(sanjusk.sendTemplate).not.toHaveBeenCalled();
  });

  test('sends only the approved template and records history', async () => {
    Followup.findById.mockReturnValue({
      lean: () => Promise.resolve({ _id: id, status: 'pending', followup_date: new Date('2026-10-01'), amount: 1000 }),
    });
    ledger.enrichFollowups.mockResolvedValue([{
      _id: id, status: 'pending', effectiveStatus: 'pending', remainingAmount: 500,
      liveOutstanding: 2000, customer_mobile: '9876543210', customer_name: 'Customer One',
      followup_date: new Date('2026-10-01'), title: 'Invoice A',
    }]);
    Followup.findOneAndUpdate.mockResolvedValue({ _id: id });
    Followup.updateOne.mockResolvedValue({ modifiedCount: 1 });
    sanjusk.sendTemplate.mockResolvedValue({ id: 'provider-message' });

    const response = await request(app).post('/api/paymentfollowup/' + id + '/send-reminder')
      .send({ confirmed: true });
    expect(response.status).toBe(200);
    expect(sanjusk.sendTemplate).toHaveBeenCalledTimes(1);
    expect(sanjusk.sendTemplate.mock.calls[0][0]).toMatchObject({
      phone: '919876543210', template: 'followup_friendly_sk', requireEnabled: true,
    });
    expect(Followup.updateOne).toHaveBeenCalledWith({ _id: id }, expect.objectContaining({
      $inc: { reminder_count: 1, Reminder_Count: 1 },
    }));
  });

  test('bulk paid messages stay disabled unless separately enabled', async () => {
    const response = await request(app).post('/api/paymentfollowup/send-overdue-reminders').send({});
    expect(response.status).toBe(403);
    expect(sanjusk.sendTemplate).not.toHaveBeenCalled();
  });
});
