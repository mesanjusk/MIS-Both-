require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const DiaryDraft = require('../../src/repositories/diaryDraft');
const { autoMatchEntries } = require('../../src/routes/BankStatement');

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
  ...overrides,
});

describe('BankStatement.autoMatchEntries', () => {
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
