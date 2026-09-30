require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const DiaryDraft = require('../../src/repositories/diaryDraft');
const Transaction = require('../../src/repositories/transaction');
const Customer = require('../../src/repositories/customer');
const {
  autoMatchEntries,
  autoLinkExistingLedgerTransactions,
  inferStatementBankLedgerFromPendingEntries,
  resolveStatementBankLedgerEvidence,
} = require('../../src/routes/BankStatement');

const makeDiary = (diaryDate, entries) =>
  DiaryDraft.create({
    diary_uuid: uuid(),
    diary_date: diaryDate,
    uploaded_by: 'tester',
    entries: entries.map((e) => ({ entry_uuid: uuid(), book: 'bank', entry_status: 'draft', ...e })),
  });

const stmtEntry = (overrides = {}) => ({
  entry_uuid: uuid(),
  txn_date: new Date('2026-03-05'),
  description: 'NEFT FROM ACME CORP',
  credit: 5000,
  debit: 0,
  direction: 'in',
  match_status: 'unmatched',
  entry_status: 'pending',
  ...overrides,
});

const makeTransaction = (date, overrides = {}) => Transaction.create({
  Transaction_uuid: uuid(),
  Transaction_id: Math.floor(Math.random() * 1000000),
  Transaction_date: date,
  Description: 'Existing ledger posting',
  Total_Debit: 5000,
  Total_Credit: 5000,
  Payment_mode: 'Bank',
  Created_by: 'tester',
  Source: 'diary:day-1:entry-1',
  Journal_entry: [
    { Account_id: '11111111-1111-4111-8111-111111111111', Account_name: 'UPI Sanju Sk', Type: 'Debit', Amount: 5000 },
    { Account_id: '22222222-2222-4222-8222-222222222222', Account_name: 'Acme Corp', Type: 'Credit', Amount: 5000 },
  ],
  ...overrides,
});

describe('BankStatement.autoMatchEntries', () => {
  test.each([
    ['before', '2026-03-03T00:00:00.000Z'],
    ['after', '2026-03-07T00:00:00.000Z'],
  ])('auto-links an already-entered bank transaction two days %s the statement date', async (_label, date) => {
    const transaction = await makeTransaction(new Date(date));
    const statement = { entries: [stmtEntry({ account_assigned: '' })] };

    const result = await autoLinkExistingLedgerTransactions(statement, {
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'UPI Sanju Sk',
    });

    expect(result).toMatchObject({ linked: 1, ambiguous: 0 });
    expect(statement.entries[0]).toMatchObject({
      account_assigned: 'Acme Corp',
      transaction_uuid: transaction.Transaction_uuid,
      entry_status: 'confirmed',
      match_status: 'manual',
      matched_party: 'Acme Corp',
    });
  });

  test('repairs legacy confirmed rows that have no linked transaction UUID', async () => {
    const transaction = await makeTransaction(new Date('2026-03-04T00:00:00.000Z'));
    const statement = { entries: [stmtEntry({ entry_status: 'confirmed', account_assigned: '' })] };

    const result = await autoLinkExistingLedgerTransactions(statement, {
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'UPI Sanju Sk',
    });

    expect(result.linked).toBe(1);
    expect(statement.entries[0].transaction_uuid).toBe(transaction.Transaction_uuid);
    expect(statement.entries[0].entry_status).toBe('confirmed');
  });

  test('infers the bank ledger from an existing posting when the statement account mapping is absent', async () => {
    const bank = await Customer.create({
      Customer_uuid: '11111111-1111-4111-8111-111111111111',
      Customer_name: 'UPI Sanju Sk',
      Customer_group: 'Bank and Account',
    });
    await Customer.create({
      Customer_uuid: '33333333-3333-4333-8333-333333333333',
      Customer_name: 'HDFC Business',
      Customer_group: 'Bank and Account',
    });
    await makeTransaction(new Date('2026-03-05T00:00:00.000Z'));
    const statement = { account_name: 'Business Account', entries: [stmtEntry()] };

    const inferred = await inferStatementBankLedgerFromPendingEntries(statement, [
      { Customer_uuid: bank.Customer_uuid, Customer_name: bank.Customer_name },
      { Customer_uuid: '33333333-3333-4333-8333-333333333333', Customer_name: 'HDFC Business' },
    ]);

    expect(inferred).toEqual({ uuid: bank.Customer_uuid, name: bank.Customer_name });
  });

  test('replaces a stale automatic bank ledger mapping when existing transactions identify the right ledger', async () => {
    const correctBank = await Customer.create({
      Customer_uuid: '11111111-1111-4111-8111-111111111111',
      Customer_name: 'UPI Sanju Sk',
      Customer_group: 'Bank and Account',
    });
    await Customer.create({
      Customer_uuid: '33333333-3333-4333-8333-333333333333',
      Customer_name: 'HDFC Business',
      Customer_group: 'Bank and Account',
    });
    await makeTransaction(new Date('2026-03-05T00:00:00.000Z'));
    const statement = {
      account_name: 'Business Account',
      ledger_account_uuid: '33333333-3333-4333-8333-333333333333',
      entries: [stmtEntry()],
    };

    const evidence = await resolveStatementBankLedgerEvidence(statement);

    expect(evidence).toEqual({ uuid: correctBank.Customer_uuid, name: correctBank.Customer_name });
  });

  test('does not auto-link beyond the two-day date window or reuse ambiguous postings', async () => {
    await makeTransaction(new Date('2026-03-02T00:00:00.000Z'));
    const outsideWindow = { entries: [stmtEntry({ account_assigned: '' })] };
    await autoLinkExistingLedgerTransactions(outsideWindow, {
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'UPI Sanju Sk',
    });
    expect(outsideWindow.entries[0].entry_status).toBe('pending');

    await makeTransaction(new Date('2026-03-05T00:00:00.000Z'));
    await makeTransaction(new Date('2026-03-05T00:00:00.000Z'));
    const ambiguous = { entries: [stmtEntry({ account_assigned: '' })] };
    const result = await autoLinkExistingLedgerTransactions(ambiguous, {
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'UPI Sanju Sk',
    });
    expect(result.ambiguous).toBe(1);
    expect(ambiguous.entries[0].entry_status).toBe('pending');
  });

  test('matches on same amount + direction + same-day date, with a party-name bonus', async () => {
    await makeDiary(new Date('2026-03-05'), [{ party: 'Acme Corp', amount: 5000, direction: 'in' }]);

    const [entry] = await autoMatchEntries([stmtEntry()]);
    expect(entry.match_status).toBe('matched');
    expect(entry.match_score).toBe(100); // 50 amount + 30 same-day + 20 party
    expect(entry.matched_party).toBe('Acme Corp');
  });

  test('matches right at the 70-point threshold (amount + 1-day proximity, no party bonus)', async () => {
    await makeDiary(new Date('2026-03-04'), [{ party: 'Unrelated Name', amount: 5000, direction: 'in' }]);

    const [entry] = await autoMatchEntries([stmtEntry()]); // txn_date 03-05, diary 03-04 => 1 day diff
    expect(entry.match_status).toBe('matched');
    expect(entry.match_score).toBe(70); // 50 amount + 20 one-day
  });

  test('does not match when the combined score falls below 70', async () => {
    // 2-day diff falls in the "<=3" bucket (+10), no party bonus => 60 total
    await makeDiary(new Date('2026-03-03'), [{ party: 'Unrelated Name', amount: 5000, direction: 'in' }]);

    const [entry] = await autoMatchEntries([stmtEntry()]);
    expect(entry.match_status).toBe('unmatched');
    expect(entry.match_score).toBeUndefined();
  });

  test('does not match across more than 7 days even with an identical amount and direction', async () => {
    await makeDiary(new Date('2026-02-20'), [{ party: 'Acme Corp', amount: 5000, direction: 'in' }]);

    const [entry] = await autoMatchEntries([stmtEntry()]);
    expect(entry.match_status).toBe('unmatched');
  });

  test('does not match when the amount differs', async () => {
    await makeDiary(new Date('2026-03-05'), [{ party: 'Acme Corp', amount: 4999, direction: 'in' }]);

    const [entry] = await autoMatchEntries([stmtEntry()]);
    expect(entry.match_status).toBe('unmatched');
  });

  test('does not match when the direction differs (diary "out" vs statement credit "in")', async () => {
    await makeDiary(new Date('2026-03-05'), [{ party: 'Acme Corp', amount: 5000, direction: 'out' }]);

    const [entry] = await autoMatchEntries([stmtEntry()]);
    expect(entry.match_status).toBe('unmatched');
  });

  test('excludes rejected diary entries from matching', async () => {
    await makeDiary(new Date('2026-03-05'), [{ party: 'Acme Corp', amount: 5000, direction: 'in', entry_status: 'rejected' }]);

    const [entry] = await autoMatchEntries([stmtEntry()]);
    expect(entry.match_status).toBe('unmatched');
  });

  test('picks the best-scoring candidate among several diary entries', async () => {
    await makeDiary(new Date('2026-03-01'), [{ party: 'Someone Else', amount: 5000, direction: 'in' }]); // far date, low score
    await makeDiary(new Date('2026-03-05'), [{ party: 'Acme Corp', amount: 5000, direction: 'in' }]); // same-day + party match, high score

    const [entry] = await autoMatchEntries([stmtEntry()]);
    expect(entry.match_status).toBe('matched');
    expect(entry.matched_party).toBe('Acme Corp');
    expect(entry.match_score).toBe(100);
  });

  test('leaves an empty entries array untouched', async () => {
    const result = await autoMatchEntries([]);
    expect(result).toEqual([]);
  });
});
