const { promptFor, validateSuggestion, suggestBankEntriesForUpload } = require('../../src/services/bankEntryAiService');

describe('Bank suggestions protect financial information', () => {
  const context = {
    entry: { entry_uuid: 'random-entry-uuid', txn_date: new Date('2026-10-28'),
      direction: 'in', credit: 500, debit: 0,
      description: 'UPI customer@example.com 9876543210 from Alpha Traders 123456789012',
      ref_no: 'SENSITIVE-REF-999' },
    diaryCandidates: [
      { diaryUuid: 'diary-id', diaryEntryUuid: 'random-diary-entry', party: 'Alpha Traders',
        notes: 'private diary notes', amount: 500, direction: 'in', daysDiff: 1, tokenOverlap: 2 },
    ],
    accountCandidates: [
      { uuid: 'random-account-uuid', name: 'Alpha Traders', group: 'Customer', score: 6 },
    ],
  };
  test('Gemini prompt omits raw narration, counterparties and references', () => {
    const prompt = promptFor([context]);
    expect(prompt).not.toContain('customer@example.com');
    expect(prompt).not.toContain('9876543210');
    expect(prompt).not.toContain('Alpha Traders');
    expect(prompt).not.toContain('private diary notes');
    expect(prompt).not.toContain('SENSITIVE-REF-999');
    expect(prompt).toContain('REDACTED_MATCH_SIGNALS');
    expect(prompt).toContain('tokenOverlap');
  });
  test('Gemini cannot suggest Diary with no token overlap or outside two days', () => {
    const bad = { ...context, diaryCandidates: [{ ...context.diaryCandidates[0], tokenOverlap: 0 }] };
    const suggestion = validateSuggestion({ category: 'review', confidence: 0.99,
      suggestedDiaryEntryUuid: 'random-diary-entry' }, bad);
    expect(suggestion.suggestedDiary).toBeNull();
  });
  test('upload review uses local processing without requesting Gemini', async () => {
    const results = await suggestBankEntriesForUpload([{
      entry_uuid: 'local-1', description: 'BANK CHARGE', entry_status: 'pending',
      match_status: 'unmatched', debit: 25, credit: 0,
    }]);
    expect(results.ai.provider).toBe('local');
    expect(results.suggestions[0]).toMatchObject({
      entryUuid: 'local-1', source: 'local', category: 'bank_charge',
    });
  });
});
