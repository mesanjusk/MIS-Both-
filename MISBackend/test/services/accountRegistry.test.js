require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Accounts = require('../../src/repositories/accounts');
const {
  getUuid,
  getName,
  resolve,
  isUuid,
  invalidateCache,
  updateBalance,
  updateBalancesForJournal,
} = require('../../src/services/accountRegistry');

beforeEach(() => {
  invalidateCache();
});

describe('accountRegistry.isUuid', () => {
  test('recognizes a v4-shaped uuid', () => {
    expect(isUuid(uuid())).toBe(true);
  });

  test('rejects a plain account name', () => {
    expect(isUuid('Cash')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('accountRegistry.getUuid', () => {
  test('auto-creates a system account with known metadata on first use', async () => {
    const acctUuid = await getUuid('Sales');
    const account = await Accounts.findOne({ Account_uuid: acctUuid }).lean();
    expect(account.Account_name).toBe('Sales');
    expect(account.Account_type).toBe('Income');
    expect(account.Normal_balance_side).toBe('credit');
    expect(account.Is_system).toBe(true);
    expect(account.Balance).toBe(0);
  });

  test('auto-creates an unknown account name with Asset/debit defaults', async () => {
    const acctUuid = await getUuid('Courier Charges');
    const account = await Accounts.findOne({ Account_uuid: acctUuid }).lean();
    expect(account.Account_type).toBe('Asset');
    expect(account.Normal_balance_side).toBe('debit');
    expect(account.Is_system).toBe(false);
  });

  test('is idempotent: resolving the same name twice returns the same uuid and does not create a duplicate account', async () => {
    const first = await getUuid('Cash');
    const second = await getUuid('cash'); // case-insensitive
    expect(second).toBe(first);
    const count = await Accounts.countDocuments({ Account_name: 'Cash' });
    expect(count).toBe(1);
  });

  test('rejects an empty account name', async () => {
    await expect(getUuid('')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('accountRegistry.getName / resolve', () => {
  test('resolve() passes a uuid through and looks up its name', async () => {
    const acctUuid = await getUuid('Bank');
    const { uuid: resolvedUuid, name } = await resolve(acctUuid);
    expect(resolvedUuid).toBe(acctUuid);
    expect(name).toBe('Bank');
  });

  test('resolve() treats a non-uuid value as an account name and resolves/creates it', async () => {
    const { uuid: resolvedUuid, name } = await resolve('Vendor Payable');
    expect(isUuid(resolvedUuid)).toBe(true);
    expect(name).toBe('Vendor Payable');
  });

  test('getName() falls back to the uuid itself when nothing matches', async () => {
    const unknownUuid = uuid();
    expect(await getName(unknownUuid)).toBe(unknownUuid);
  });
});

describe('accountRegistry.updateBalance / updateBalancesForJournal', () => {
  test('a Debit entry increases the balance of a debit-normal account (e.g. Cash)', async () => {
    const acctUuid = await getUuid('Cash');
    await updateBalance(acctUuid, 'Debit', 100);
    const account = await Accounts.findOne({ Account_uuid: acctUuid }).lean();
    expect(account.Balance).toBe(100);
  });

  test('a Credit entry decreases the balance of a debit-normal account', async () => {
    const acctUuid = await getUuid('Cash');
    await updateBalance(acctUuid, 'Debit', 100);
    await updateBalance(acctUuid, 'Credit', 40);
    const account = await Accounts.findOne({ Account_uuid: acctUuid }).lean();
    expect(account.Balance).toBe(60);
  });

  test('a Credit entry increases the balance of a credit-normal account (e.g. Sales)', async () => {
    const acctUuid = await getUuid('Sales');
    await updateBalance(acctUuid, 'Credit', 500);
    const account = await Accounts.findOne({ Account_uuid: acctUuid }).lean();
    expect(account.Balance).toBe(500);
  });

  test('updateBalancesForJournal applies every line in a journal entry', async () => {
    const cashUuid = await getUuid('Cash');
    const salesUuid = await getUuid('Sales');
    await updateBalancesForJournal([
      { Account_id: cashUuid, Type: 'Debit', Amount: 250 },
      { Account_id: salesUuid, Type: 'Credit', Amount: 250 },
    ]);
    const cash = await Accounts.findOne({ Account_uuid: cashUuid }).lean();
    const sales = await Accounts.findOne({ Account_uuid: salesUuid }).lean();
    expect(cash.Balance).toBe(250);
    expect(sales.Balance).toBe(250);
  });
});
