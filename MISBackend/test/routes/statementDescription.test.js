const express = require('express');
const request = require('supertest');

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1', userName: 'Account Admin' }; next(); },
}));
jest.mock('../../src/middleware/requirePermission', () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));
jest.mock('../../src/repositories/transaction');
jest.mock('../../src/repositories/transactionAudit');
jest.mock('../../src/repositories/order');
jest.mock('../../src/services/statementInvoiceDetailsService', () => ({
  getStatementInvoiceDetails: jest.fn(),
}));
jest.mock('../../src/services/accountRegistry', () => ({
  resolve: jest.fn(), isUuid: jest.fn(), applyBalanceMovement: jest.fn(),
}));
jest.mock('../../src/services/businessWorkflowService', () => ({
  refreshOrderPaymentStatus: jest.fn(),
}));

const Transaction = require('../../src/repositories/transaction');
const TransactionAudit = require('../../src/repositories/transactionAudit');
const { applyBalanceMovement } = require('../../src/services/accountRegistry');
const { getStatementInvoiceDetails } = require('../../src/services/statementInvoiceDetailsService');
const app = express();
app.use(express.json());
app.use('/api/transaction', require('../../src/routes/Transaction'));

const original = {
  Transaction_uuid: 'txn-123', Transaction_id: 861, Description: 'Info Origin',
  Total_Debit: 2100, Total_Credit: 2100,
  Journal_entry: [
    { Account_id: 'customer-1', Type: 'Debit', Amount: 2100 },
    { Account_id: 'sales-1', Type: 'Credit', Amount: 2100 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  Transaction.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(original) });
  Transaction.findOneAndUpdate.mockResolvedValue({ ...original, Description: '100 Wedding Cards' });
  TransactionAudit.create.mockResolvedValue({});
});

describe('statement item lookup / description-only transaction edit', () => {
  test('limits invoice item lookup inputs and loads source transactions itself', async () => {
    const responseBad = await request(app).post('/api/transaction/statement-invoice-details')
      .send({ transactionUuids: Array.from({ length: 101 }, (_, i) => String(i)) });
    expect(responseBad.status).toBe(400);
    expect(Transaction.find).not.toHaveBeenCalled();

    Transaction.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([original]) });
    getStatementInvoiceDetails.mockResolvedValue({
      'txn-123': { items: [{ name: 'Wedding Cards', quantity: 100 }] },
    });
    const response = await request(app).post('/api/transaction/statement-invoice-details')
      .send({ transactionUuids: ['txn-123'] });
    expect(response.status).toBe(200);
    expect(Transaction.find).toHaveBeenCalledWith(
      { Transaction_uuid: { $in: ['txn-123'] } }, expect.objectContaining({ Order_uuid: 1 }),
    );
    expect(response.body.result['txn-123'].items[0].name).toBe('Wedding Cards');
  });

  test('updates Description alone, audits it and NEVER reverses/reposts the journal', async () => {
    const response = await request(app).patch('/api/transaction/txn-123/description')
      .send({ Description: '  100 Wedding Cards  ' });
    expect(response.status).toBe(200);
    expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
      { Transaction_uuid: 'txn-123' },
      { $set: { Description: '100 Wedding Cards' } },
      { new: true, runValidators: true },
    );
    expect(TransactionAudit.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'edit',
      before: expect.objectContaining({ Description: 'Info Origin', Total_Debit: 2100 }),
      after: expect.objectContaining({ Description: '100 Wedding Cards', Total_Debit: 2100 }),
    }));
    expect(applyBalanceMovement).not.toHaveBeenCalled();
    expect(Transaction.findOneAndDelete).not.toHaveBeenCalled();
  });

  test('rejects blank or overlong descriptions without a database write', async () => {
    for (const Description of ['', '   ', 'x'.repeat(2001)]) {
      const response = await request(app).patch('/api/transaction/txn-123/description')
        .send({ Description });
      expect(response.status).toBe(400);
    }
    expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
