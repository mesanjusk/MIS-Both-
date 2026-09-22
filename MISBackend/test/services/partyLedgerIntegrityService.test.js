require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Accounts = require('../../src/repositories/accounts');
const Customer = require('../../src/repositories/customer');
const Transaction = require('../../src/repositories/transaction');
const { repairShadowPartyJournalLines } = require('../../src/services/partyLedgerIntegrityService');

describe('partyLedgerIntegrityService', () => {
  test('moves Diary/Bank shadow party lines to the real customer UUID', async () => {
    const customerUuid = uuid();
    const shadowUuid = uuid();
    const bankUuid = uuid();

    await Customer.create({
      Customer_uuid: customerUuid,
      Customer_name: 'SK Priyanka',
      Customer_group: 'Customer',
    });

    await Accounts.create({
      Account_uuid: shadowUuid,
      Account_name: 'SK Priyanka',
      Account_type: 'Asset',
      Account_code: 9001,
      Normal_balance_side: 'debit',
      Account_group: 'General',
      Is_system: false,
      Balance: 6000,
    });

    await Accounts.create({
      Account_uuid: bankUuid,
      Account_name: 'Bank',
      Account_type: 'Asset',
      Account_code: 9002,
      Normal_balance_side: 'debit',
      Account_group: 'Cash & Bank',
      Is_system: true,
      Balance: -6000,
    });

    const txnUuid = uuid();
    await Transaction.create({
      Transaction_uuid: txnUuid,
      Transaction_id: 2663,
      Transaction_date: new Date('2026-09-12T00:00:00.000Z'),
      Description: 'Bank payment to SK Priyanka',
      Total_Debit: 6000,
      Total_Credit: 6000,
      Payment_mode: 'Bank',
      Created_by: 'test',
      Source: 'business:bank_statement:statement:entry',
      Journal_entry: [
        { Account_id: shadowUuid, Account_name: 'SK Priyanka', Type: 'Debit', Amount: 6000 },
        { Account_id: bankUuid, Account_name: 'Bank', Type: 'Credit', Amount: 6000 },
      ],
    });

    const result = await repairShadowPartyJournalLines();

    expect(result.transactionsRepaired).toBe(1);
    expect(result.journalLinesRepaired).toBe(1);

    const repaired = await Transaction.findOne({ Transaction_uuid: txnUuid }).lean();
    expect(repaired.Journal_entry[0].Account_id).toBe(customerUuid);
    expect(repaired.Journal_entry[0].Account_name).toBe('SK Priyanka');

    const shadow = await Accounts.findOne({ Account_uuid: shadowUuid }).lean();
    expect(shadow.Balance).toBe(0);
  });

  test('does not rewrite unrelated manual transactions', async () => {
    const customerUuid = uuid();
    const shadowUuid = uuid();

    await Customer.create({
      Customer_uuid: customerUuid,
      Customer_name: 'Example Party',
      Customer_group: 'Customer',
    });

    await Accounts.create({
      Account_uuid: shadowUuid,
      Account_name: 'Example Party',
      Account_type: 'Asset',
      Account_code: 9101,
      Normal_balance_side: 'debit',
      Account_group: 'General',
      Is_system: false,
      Balance: 100,
    });

    const txnUuid = uuid();
    await Transaction.create({
      Transaction_uuid: txnUuid,
      Transaction_id: 9999,
      Transaction_date: new Date('2026-09-12T00:00:00.000Z'),
      Description: 'Manual journal',
      Total_Debit: 100,
      Total_Credit: 100,
      Payment_mode: 'Journal',
      Created_by: 'test',
      Source: 'manual:journal',
      Journal_entry: [
        { Account_id: shadowUuid, Account_name: 'Example Party', Type: 'Debit', Amount: 100 },
        { Account_id: uuid(), Account_name: 'Other', Type: 'Credit', Amount: 100 },
      ],
    });

    const result = await repairShadowPartyJournalLines();
    expect(result.transactionsRepaired).toBe(0);

    const untouched = await Transaction.findOne({ Transaction_uuid: txnUuid }).lean();
    expect(untouched.Journal_entry[0].Account_id).toBe(shadowUuid);
  });
});
