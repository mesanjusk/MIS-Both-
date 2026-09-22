require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Customer = require('../../src/repositories/customer');
const Transaction = require('../../src/repositories/transaction');
const {
  isCustomerOpeningBalanceCandidate,
  repairDuplicateCustomerOpeningBalances,
} = require('../../src/services/openingBalanceIntegrityService');

describe('openingBalanceIntegrityService', () => {
  test('removes only duplicate opening balance rows for the same customer', async () => {
    const customerUuid = uuid();
    const contraUuid = uuid();

    const customer = await Customer.create({
      Customer_uuid: customerUuid,
      Customer_name: 'SK Priyanka',
      Customer_group: 'Customer',
      Opening_balance: 6500,
      Opening_balance_type: 'credit',
      Opening_balance_date: new Date('2026-04-01T00:00:00.000Z'),
    });

    const base = {
      Transaction_date: new Date('2026-04-01T00:00:00.000Z'),
      Description: 'Opening balance — SK Priyanka',
      Total_Debit: 6500,
      Total_Credit: 6500,
      Payment_mode: 'Journal',
      Created_by: 'test',
      Source: 'opening:balance',
      Journal_entry: [
        { Account_id: contraUuid, Account_name: 'Opening Balance', Type: 'Debit', Amount: 6500 },
        { Account_id: customerUuid, Account_name: 'SK Priyanka', Type: 'Credit', Amount: 6500 },
      ],
    };

    await Transaction.create({
      ...base,
      Transaction_uuid: uuid(),
      Transaction_id: 527,
    });
    await Transaction.create({
      ...base,
      Transaction_uuid: uuid(),
      Transaction_id: 2076,
      Customer_uuid: customerUuid,
    });

    const result = await repairDuplicateCustomerOpeningBalances();

    expect(result.customersWithDuplicates).toBe(1);
    expect(result.duplicatesRemoved).toBe(1);

    const remaining = await Transaction.find({
      'Journal_entry.Account_id': customerUuid,
      Description: 'Opening balance — SK Priyanka',
    }).lean();

    expect(remaining).toHaveLength(1);
    expect(remaining[0].Customer_uuid).toBe(customerUuid);
    expect(remaining[0].Transaction_id).toBe(2076);
  });

  test('does not treat a normal payment with the same amount as an opening balance', async () => {
    const customerUuid = uuid();
    const customer = {
      Customer_uuid: customerUuid,
      Customer_name: 'SK Priyanka',
      Opening_balance: 6500,
      Opening_balance_type: 'credit',
      Opening_balance_date: new Date('2026-04-01T00:00:00.000Z'),
    };
    const transaction = {
      Transaction_date: new Date('2026-04-01T00:00:00.000Z'),
      Description: 'Online',
      Source: 'business:bank_statement:stmt:entry',
      Journal_entry: [
        { Account_id: customerUuid, Account_name: 'SK Priyanka', Type: 'Credit', Amount: 6500 },
      ],
    };

    expect(isCustomerOpeningBalanceCandidate(transaction, customer)).toBe(false);
  });

  test('does not remove opening balances with a different amount or side', async () => {
    const customerUuid = uuid();
    await Customer.create({
      Customer_uuid: customerUuid,
      Customer_name: 'Different Party',
      Customer_group: 'Customer',
      Opening_balance: 6500,
      Opening_balance_type: 'credit',
      Opening_balance_date: new Date('2026-04-01T00:00:00.000Z'),
    });

    await Transaction.create({
      Transaction_uuid: uuid(),
      Transaction_id: 3000,
      Transaction_date: new Date('2026-04-01T00:00:00.000Z'),
      Description: 'Opening balance — Different Party',
      Total_Debit: 7000,
      Total_Credit: 7000,
      Payment_mode: 'Journal',
      Created_by: 'test',
      Source: 'opening:balance',
      Journal_entry: [
        { Account_id: uuid(), Account_name: 'Opening Balance', Type: 'Debit', Amount: 7000 },
        { Account_id: customerUuid, Account_name: 'Different Party', Type: 'Credit', Amount: 7000 },
      ],
    });

    const result = await repairDuplicateCustomerOpeningBalances();
    expect(result.duplicatesRemoved).toBe(0);
    expect(await Transaction.countDocuments({ Transaction_id: 3000 })).toBe(1);
  });
});
