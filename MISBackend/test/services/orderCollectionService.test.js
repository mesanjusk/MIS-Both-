jest.mock('../../src/repositories/customer');
jest.mock('../../src/repositories/paymentFollowup');
jest.mock('../../src/services/paymentFollowupLedgerService', () => ({
  getReceivableBalances: jest.fn(),
  money: (value) => Math.round((Number(value) || 0) * 100) / 100,
}));

const Customers = require('../../src/repositories/customer');
const PaymentFollowup = require('../../src/repositories/paymentFollowup');
const { getReceivableBalances } = require('../../src/services/paymentFollowupLedgerService');
const { ensureCollectionFollowup } = require('../../src/services/orderCollectionService');

const order = { Order_uuid: 'order-1', Order_Number: 17, Customer_uuid: 'customer-1' };

beforeEach(() => {
  jest.clearAllMocks();
  Customers.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ Customer_name: 'Example Customer' }) });
  getReceivableBalances.mockResolvedValue(new Map([['customer-1', 800]]));
  PaymentFollowup.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue({ followup_uuid: 'created' }) });
});

test('creates only an internal idempotent task capped by verified journal receivable', async () => {
  await ensureCollectionFollowup({ order, orderTotal: 1500, receivedAmount: 500 });
  const [filter, update, options] = PaymentFollowup.findOneAndUpdate.mock.calls[0];
  expect(filter).toEqual({ source_order_uuid: 'order-1' });
  expect(update.$setOnInsert.amount).toBe(800);
  expect(update.$setOnInsert.baseline_outstanding).toBe(800);
  expect(update.$setOnInsert.status).toBe('pending');
  expect(options.upsert).toBe(true);
  expect(update.$set).toBeUndefined();
});

test('does not queue fully paid orders', async () => {
  expect(await ensureCollectionFollowup({ order, orderTotal: 500, receivedAmount: 500 })).toBeNull();
  expect(PaymentFollowup.findOneAndUpdate).not.toHaveBeenCalled();
});

test('does not queue orders with no verified customer ledger receivable', async () => {
  getReceivableBalances.mockResolvedValue(new Map([['customer-1', -200]]));
  expect(await ensureCollectionFollowup({ order, orderTotal: 1200, receivedAmount: 100 })).toBeNull();
  expect(PaymentFollowup.findOneAndUpdate).not.toHaveBeenCalled();
});
