jest.mock('../../src/repositories/customer');
jest.mock('../../src/repositories/transaction');

const Customers = require('../../src/repositories/customer');
const Transaction = require('../../src/repositories/transaction');
const { ACCOUNT_PAYABLE_GROUP } = require('../../src/constants/assignees');
const { getPayableLedgerTransactions, PAYABLE_TRANSACTION_FIELDS } =
  require('../../src/services/payableLedgerReadService');

beforeEach(() => jest.clearAllMocks());

describe('indexed Home Payable ledger read', () => {
  test('skips transaction scan when no active payable accounts exist', async () => {
    Customers.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    await expect(getPayableLedgerTransactions()).resolves.toEqual([]);
    expect(Customers.find).toHaveBeenCalledWith(
      { Status: 'active', Customer_group: ACCOUNT_PAYABLE_GROUP },
      { Customer_uuid: 1 },
    );
    expect(Transaction.find).not.toHaveBeenCalled();
  });

  test('uses a deduplicated account-ID filter and preserves complete journals', async () => {
    Customers.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { Customer_uuid: 'vendor-1' },
        { Customer_uuid: 'vendor-2' },
        { Customer_uuid: 'vendor-1' },
        { Customer_uuid: null },
      ]),
    });
    const records = [{
      Transaction_uuid: 'tx1',
      Journal_entry: [
        { Account_id: 'vendor-1', Type: 'Credit', Amount: 100 },
        { Account_id: 'vendor-2', Type: 'Debit', Amount: 100 },
      ],
    }];
    const lean = jest.fn().mockResolvedValue(records);
    const sort = jest.fn().mockReturnValue({ lean });
    Transaction.find.mockReturnValue({ sort });

    await expect(getPayableLedgerTransactions()).resolves.toEqual(records);
    expect(Transaction.find).toHaveBeenCalledWith(
      { 'Journal_entry.Account_id': { $in: ['vendor-1', 'vendor-2'] } },
      PAYABLE_TRANSACTION_FIELDS,
    );
    expect(PAYABLE_TRANSACTION_FIELDS).toEqual(expect.objectContaining({
      Transaction_date: 1,
      Description: 1,
      Journal_entry: 1,
    }));
    expect(sort).toHaveBeenCalledWith({ Transaction_date: -1 });
  });
});
