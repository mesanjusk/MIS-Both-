const { matchesDiaryJournal } = require('../../src/routes/DiaryDraft');
const txn = { Journal_entry: [
  { Account_id: 'cash', Type: 'Debit', Amount: 500 },
  { Account_id: 'party', Type: 'Credit', Amount: 500 },
] };
describe('Diary duplicate matching', () => {
  test('matches journal legs', () => expect(matchesDiaryJournal(txn, { amount: 500, direction: 'in' }, 'cash', 'party')).toBe(true));
  test('rejects wrong party', () => expect(matchesDiaryJournal(txn, { amount: 500, direction: 'in' }, 'cash', 'other')).toBe(false));
  test('rejects wrong ledger', () => expect(matchesDiaryJournal(txn, { amount: 500, direction: 'in' }, 'bank', 'party')).toBe(false));
  test('rejects wrong direction', () => expect(matchesDiaryJournal(txn, { amount: 500, direction: 'out' }, 'cash', 'party')).toBe(false));
  test('rejects wrong amount', () => expect(matchesDiaryJournal(txn, { amount: 501, direction: 'in' }, 'cash', 'party')).toBe(false));
});
