/**
 * Regression cover for the accounting-integrity defects:
 *
 *   - balances drifting because an edit re-applied the new journal without
 *     reversing the old one, and a delete never reversed at all
 *   - a journal of unrecognized entry types summing to 0 = 0 and passing as
 *     "balanced"
 *   - two transaction-number allocators handing out overlapping numbers
 *
 * Persistence is mocked, so these run without a MongoDB server.
 */

jest.mock('../../src/repositories/accounts', () => ({
  find: jest.fn(),
  bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
}));

jest.mock('../../src/repositories/transaction', () => ({
  findOne: jest.fn(),
}));

jest.mock('../../src/repositories/counter', () => ({
  updateOne: jest.fn().mockResolvedValue({ ok: 1 }),
  findByIdAndUpdate: jest.fn(),
}));

const Accounts    = require('../../src/repositories/accounts');
const Transaction = require('../../src/repositories/transaction');
const Counter     = require('../../src/repositories/counter');

const { applyBalanceMovement, lineDelta } = require('../../src/services/accountRegistry');
const { validateBalancedJournal }         = require('../../src/services/accountingPostingService');
const transactionNumber                   = require('../../src/services/transactionNumberService');

const CASH  = 'acct-cash';
const SALES = 'acct-sales';

/** Accounts.find(...).select(...).lean() with a fixed result. */
const mockAccounts = (rows) => {
  Accounts.find.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(rows) }),
  });
};

/** The $inc applied to each account by the last bulkWrite. */
const writtenDeltas = () => {
  const [ops] = Accounts.bulkWrite.mock.calls.at(-1) || [[]];
  return Object.fromEntries(
    ops.map((op) => [op.updateOne.filter.Account_uuid, op.updateOne.update.$inc.Balance])
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  Accounts.bulkWrite.mockResolvedValue({ ok: 1 });
  mockAccounts([
    { Account_uuid: CASH,  Normal_balance_side: 'debit'  },
    { Account_uuid: SALES, Normal_balance_side: 'credit' },
  ]);
});

describe('lineDelta', () => {
  test('a line on the account normal side increases the balance', () => {
    expect(lineDelta('Debit', 100, 'debit')).toBe(100);
    expect(lineDelta('Credit', 100, 'credit')).toBe(100);
  });

  test('a line on the opposite side decreases it', () => {
    expect(lineDelta('Credit', 100, 'debit')).toBe(-100);
    expect(lineDelta('Debit', 100, 'credit')).toBe(-100);
  });

  test('defaults to a debit-normal account when the side is unset', () => {
    expect(lineDelta('Debit', 40, undefined)).toBe(40);
  });
});

describe('applyBalanceMovement', () => {
  const journal = (amount) => ([
    { Account_id: CASH,  Type: 'Debit',  Amount: amount },
    { Account_id: SALES, Type: 'Credit', Amount: amount },
  ]);

  test('applies a new journal to both sides', async () => {
    await applyBalanceMovement({ apply: journal(100) });
    expect(writtenDeltas()).toEqual({ [CASH]: 100, [SALES]: 100 });
  });

  test('reverses a journal on delete, undoing exactly what was applied', async () => {
    await applyBalanceMovement({ reverse: journal(100) });
    expect(writtenDeltas()).toEqual({ [CASH]: -100, [SALES]: -100 });
  });

  test('an edit from 100 to 150 moves the balance by the difference only', async () => {
    // The defect: posting the 150 journal without reversing the 100 left the
    // balance at 250 instead of 150.
    await applyBalanceMovement({ reverse: journal(100), apply: journal(150) });
    expect(writtenDeltas()).toEqual({ [CASH]: 50, [SALES]: 50 });
  });

  test('an edit that changes nothing writes nothing', async () => {
    await applyBalanceMovement({ reverse: journal(100), apply: journal(100) });
    expect(Accounts.bulkWrite).not.toHaveBeenCalled();
  });

  test('skips lines whose account has no Accounts row', async () => {
    mockAccounts([{ Account_uuid: CASH, Normal_balance_side: 'debit' }]);
    await applyBalanceMovement({
      apply: [
        { Account_id: CASH,        Type: 'Debit',  Amount: 100 },
        { Account_id: 'not-an-acct', Type: 'Credit', Amount: 100 },
      ],
    });
    expect(writtenDeltas()).toEqual({ [CASH]: 100 });
  });

  test('ignores a non-numeric amount rather than writing NaN', async () => {
    await applyBalanceMovement({
      apply: [
        { Account_id: CASH,  Type: 'Debit',  Amount: 'abc' },
        { Account_id: SALES, Type: 'Credit', Amount: 100 },
      ],
    });
    expect(writtenDeltas()).toEqual({ [SALES]: 100 });
  });

  test('does not touch the database for an empty movement', async () => {
    await applyBalanceMovement({});
    expect(Accounts.find).not.toHaveBeenCalled();
    expect(Accounts.bulkWrite).not.toHaveBeenCalled();
  });
});

describe('validateBalancedJournal', () => {
  test('rejects a journal whose entry types are unrecognized', () => {
    // Previously summed to debit 0 / credit 0 and was accepted as balanced.
    expect(() =>
      validateBalancedJournal([
        { Type: 'bogus', Amount: 100 },
        { Type: 'bogus', Amount: 50 },
      ])
    ).toThrow(/invalid Type/);
  });

  test('rejects a journal that is all debits', () => {
    expect(() =>
      validateBalancedJournal([
        { Type: 'Debit', Amount: 100 },
        { Type: 'Debit', Amount: 100 },
      ])
    ).toThrow(/at least one debit and one credit/i);
  });

  test('rejects non-positive and non-finite amounts', () => {
    expect(() => validateBalancedJournal([
      { Type: 'Debit', Amount: -100 }, { Type: 'Credit', Amount: -100 },
    ])).toThrow(/greater than zero/);
    expect(() => validateBalancedJournal([
      { Type: 'Debit', Amount: 0 }, { Type: 'Credit', Amount: 0 },
    ])).toThrow(/greater than zero/);
  });

  test('still rejects an unbalanced journal', () => {
    expect(() =>
      validateBalancedJournal([
        { Type: 'Debit', Amount: 100 },
        { Type: 'Credit', Amount: 50 },
      ])
    ).toThrow(/not balanced/);
  });

  test('accepts a balanced journal and returns derived totals', () => {
    expect(
      validateBalancedJournal([
        { Type: 'Debit',  Amount: 100 },
        { Type: 'Credit', Amount: 60 },
        { Type: 'Credit', Amount: 40 },
      ])
    ).toEqual({ debit: 100, credit: 100 });
  });

  test('accepts the abbreviated and lower-case type spellings already in use', () => {
    expect(
      validateBalancedJournal([
        { Type: 'debit', Amount: '₹1,000' },
        { Type: 'cr',    Amount: 1000 },
      ])
    ).toEqual({ debit: 1000, credit: 1000 });
  });
});

describe('transactionNumberService', () => {
  beforeEach(() => {
    transactionNumber._resetSeedCache();
    Transaction.findOne.mockReturnValue({
      sort: () => ({ select: () => ({ lean: () => Promise.resolve({ Transaction_id: 4200 }) }) }),
    });
    let seq = 4200;
    Counter.findByIdAndUpdate.mockImplementation(() => ({
      lean: () => Promise.resolve({ seq: ++seq }),
    }));
  });

  test('lifts the counter above the highest stored id before allocating', async () => {
    await transactionNumber.allocate();
    expect(Counter.updateOne).toHaveBeenCalledWith(
      { _id: 'transaction_number' },
      { $max: { seq: 4200 } },
      { upsert: true }
    );
  });

  test('seeds once per process, not on every allocation', async () => {
    await transactionNumber.allocate();
    await transactionNumber.allocate();
    await transactionNumber.allocate();
    expect(Counter.updateOne).toHaveBeenCalledTimes(1);
  });

  test('concurrent callers each receive a distinct number', async () => {
    const ids = await Promise.all(Array.from({ length: 25 }, () => transactionNumber.allocate()));
    expect(new Set(ids).size).toBe(25);
  });

  test('allocated numbers never collide with existing max+1 rows', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => transactionNumber.allocate()));
    expect(Math.min(...ids)).toBeGreaterThan(4200);
  });

  test('a failed seed is retried rather than cached', async () => {
    transactionNumber._resetSeedCache();
    Transaction.findOne.mockReturnValueOnce({
      sort: () => ({ select: () => ({ lean: () => Promise.reject(new Error('db down')) }) }),
    });
    await expect(transactionNumber.allocate()).rejects.toThrow('db down');
    await expect(transactionNumber.allocate()).resolves.toBeGreaterThan(4200);
  });
});
