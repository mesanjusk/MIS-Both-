require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Users = require('../../src/repositories/users');
const Accounts = require('../../src/repositories/accounts');
const Customer = require('../../src/repositories/customer');
const Transaction = require('../../src/repositories/transaction');
const { repairStaffAccountMappings } = require('../../src/services/staffAccountMappingRepairService');

describe('staffAccountMappingRepairService', () => {
  test('moves a legacy staff General account to the unique matching customer ledger', async () => {
    const oldAccountUuid = uuid();
    const customerUuid = uuid();
    const otherUuid = uuid();

    await Accounts.create({
      Account_uuid: oldAccountUuid,
      Account_name: 'Sk Sai',
      Account_type: 'Asset',
      Account_code: 9701,
      Normal_balance_side: 'debit',
      Account_group: 'General',
      Is_system: false,
      Balance: 1900,
    });

    await Accounts.create({
      Account_uuid: otherUuid,
      Account_name: 'Cash',
      Account_type: 'Asset',
      Account_code: 9702,
      Normal_balance_side: 'debit',
      Account_group: 'Cash & Bank',
      Is_system: true,
      Balance: -1900,
    });

    await Customer.create({
      Customer_uuid: customerUuid,
      Customer_name: 'Sk Sai',
      Customer_group: 'Account Payable',
    });

    const user = await Users.create({
      User_uuid: uuid(),
      User_name: 'Sai',
      Password: 'test-password',
      Mobile_number: '9999999999',
      User_group: 'Office Design',
      Amount: 0,
      AccountID: oldAccountUuid,
    });

    const txnUuid = uuid();
    await Transaction.create({
      Transaction_uuid: txnUuid,
      Transaction_id: 12345,
      Transaction_date: new Date('2026-05-22T00:00:00.000Z'),
      Description: 'Sai S.K.',
      Total_Debit: 100,
      Total_Credit: 100,
      Payment_mode: 'Cash',
      Created_by: 'test',
      Source: 'business:staff_payment',
      Journal_entry: [
        { Account_id: oldAccountUuid, Account_name: 'Sk Sai', Type: 'Debit', Amount: 100 },
        { Account_id: otherUuid, Account_name: 'Cash', Type: 'Credit', Amount: 100 },
      ],
    });

    const result = await repairStaffAccountMappings();

    expect(result.usersRemapped).toBe(1);
    expect(result.transactionsRepaired).toBe(1);

    const updatedUser = await Users.findById(user._id).lean();
    expect(updatedUser.AccountID).toBe(customerUuid);

    const updatedTxn = await Transaction.findOne({ Transaction_uuid: txnUuid }).lean();
    expect(updatedTxn.Journal_entry[0].Account_id).toBe(customerUuid);
    expect(updatedTxn.Journal_entry[0].Account_name).toBe('Sk Sai');
  });

  test('does not remap when more than one customer has the same name', async () => {
    const oldAccountUuid = uuid();

    await Accounts.create({
      Account_uuid: oldAccountUuid,
      Account_name: 'Duplicate Staff',
      Account_type: 'Asset',
      Account_code: 9711,
      Normal_balance_side: 'debit',
      Account_group: 'General',
      Is_system: false,
      Balance: 0,
    });

    await Customer.create({
      Customer_uuid: uuid(),
      Customer_name: 'Duplicate Staff',
      Customer_group: 'Account Payable',
    });
    await Customer.create({
      Customer_uuid: uuid(),
      Customer_name: 'Duplicate Staff',
      Customer_group: 'Account Payable',
    });

    const user = await Users.create({
      User_uuid: uuid(),
      User_name: 'Duplicate Staff',
      Password: 'test-password',
      Mobile_number: '8888888888',
      User_group: 'Office User',
      Amount: 0,
      AccountID: oldAccountUuid,
    });

    const result = await repairStaffAccountMappings();
    expect(result.usersRemapped).toBe(0);

    const untouched = await Users.findById(user._id).lean();
    expect(untouched.AccountID).toBe(oldAccountUuid);
  });
});
