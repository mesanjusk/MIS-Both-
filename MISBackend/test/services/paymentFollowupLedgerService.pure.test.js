jest.mock('../../src/repositories/customer');
jest.mock('../../src/repositories/transaction');

const Customers = require('../../src/repositories/customer');
const Transaction = require('../../src/repositories/transaction');
const {
  followupWithBalance, getReceivableBalances, enrichFollowups, indiaDay,
} = require('../../src/services/paymentFollowupLedgerService');

const customer = { Customer_uuid: 'customer-1', Customer_name: 'Test Customer', Mobile_number: '9876543210' };
const base = {
  _id: 'followup-1', customer_uuid: customer.Customer_uuid, customer_name: customer.Customer_name,
  amount: 1000, baseline_outstanding: 2500, followup_date: new Date('2026-09-28T06:30:00.000Z'),
  status: 'pending',
};

beforeEach(() => jest.clearAllMocks());

describe('follow-up ledger reconciliation', () => {
  test('partial receipts reduce remaining follow-up without posting or mutating money', () => {
    const row = followupWithBalance(base, customer, 2000, new Date('2026-09-29T06:30:00Z'));
    expect(row.remainingAmount).toBe(500);
    expect(row.liveOutstanding).toBe(2000);
    expect(row.effectiveStatus).toBe('pending');
    expect(row.overdue).toBe(true);
  });

  test('an amount settled through the ledger is automatically shown done', () => {
    const row = followupWithBalance(base, customer, 1500, new Date('2026-09-29T06:30:00Z'));
    expect(row.remainingAmount).toBe(0);
    expect(row.autoSettled).toBe(true);
    expect(row.effectiveStatus).toBe('done');
    expect(row.overdue).toBe(false);
  });

  test('new invoices never increase follow-up remaining beyond its original amount', () => {
    expect(followupWithBalance(base, customer, 5000).remainingAmount).toBe(1000);
  });

  test('unlinked or ambiguous legacy records never auto-settle from a zero balance', () => {
    const row = { ...base, customer_uuid: '', baseline_outstanding: 0 };
    expect(followupWithBalance(row, customer, 0).effectiveStatus).toBe('pending');
    expect(followupWithBalance(row, null, null).remainingAmount).toBe(1000);
  });

  test('manually completed follow-ups stay done', () => {
    expect(followupWithBalance({ ...base, status: 'done' }, customer, 2200).effectiveStatus).toBe('done');
  });

  test('dates are evaluated in the India timezone', () => {
    expect(indiaDay(new Date('2026-09-28T20:00:00Z'))).toBe('2026-09-29');
  });

  test('aggregates indexed UUID journal lines rather than account names', async () => {
    Transaction.aggregate.mockResolvedValue([{ _id: 'customer-1', debit: 2300, credit: 800 }]);
    const rows = await getReceivableBalances(['customer-1', 'customer-1']);
    expect(rows.get('customer-1')).toBe(1500);
    const pipeline = Transaction.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { 'Journal_entry.Account_id': { $in: ['customer-1'] } } });
    expect(pipeline[1]).toEqual({ $unwind: '$Journal_entry' });
    expect(pipeline[2]).toEqual({ $match: { 'Journal_entry.Account_id': { $in: ['customer-1'] } } });
  });

  test('ambiguous legacy display names do not link to an arbitrary ledger', async () => {
    Customers.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { Customer_uuid: 'c1', Customer_name: 'Same Name' },
        { Customer_uuid: 'c2', Customer_name: 'Same Name' },
      ]),
    });
    const [row] = await enrichFollowups([{ ...base, customer_uuid: '', baseline_outstanding: 0, customer_name: 'Same Name' }]);
    expect(row.customer_uuid).toBe('');
    expect(row.liveOutstanding).toBeNull();
    expect(Transaction.aggregate).not.toHaveBeenCalled();
  });
});
