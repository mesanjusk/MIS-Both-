const { normalizeIncomingText, matchAutoReplyRule, resolveReplyDelayMs } = require('../../src/middleware/autoReply');

describe('autoReply.normalizeIncomingText', () => {
  test('trims and lowercases', () => {
    expect(normalizeIncomingText('  Hello WORLD  ')).toBe('hello world');
  });

  test('handles missing input', () => {
    expect(normalizeIncomingText(undefined)).toBe('');
  });
});

describe('autoReply.matchAutoReplyRule', () => {
  const rules = [
    { isActive: true, keyword: 'price', matchType: 'contains', name: 'price-rule' },
    { isActive: true, keyword: 'hi', matchType: 'exact', name: 'greeting-rule' },
    { isActive: true, keyword: 'order status', matchType: 'starts_with', name: 'status-rule' },
    { isActive: false, keyword: 'inactive', matchType: 'contains', name: 'disabled-rule' },
  ];

  test('returns null for empty text or an empty/missing rule list', () => {
    expect(matchAutoReplyRule('', rules)).toBeNull();
    expect(matchAutoReplyRule('hello', [])).toBeNull();
    expect(matchAutoReplyRule('hello', undefined)).toBeNull();
  });

  test('matches "contains" rules anywhere in the message', () => {
    expect(matchAutoReplyRule('what is the price of item X?', rules)?.name).toBe('price-rule');
  });

  test('matches "exact" rules only on an exact match', () => {
    expect(matchAutoReplyRule('hi', rules)?.name).toBe('greeting-rule');
    expect(matchAutoReplyRule('hi there', rules)?.name).not.toBe('greeting-rule');
  });

  test('matches "starts_with" rules only at the beginning of the message', () => {
    expect(matchAutoReplyRule('order status please', rules)?.name).toBe('status-rule');
    expect(matchAutoReplyRule('please give order status', rules)).toBeNull();
  });

  test('is case-insensitive on both the incoming text and the keyword', () => {
    expect(matchAutoReplyRule('WHAT IS THE PRICE', rules)?.name).toBe('price-rule');
  });

  test('skips inactive rules entirely, even on a keyword match', () => {
    expect(matchAutoReplyRule('this is inactive', rules)).toBeNull();
  });

  test('returns the first matching rule when multiple rules could match', () => {
    const overlapping = [
      { isActive: true, keyword: 'hi', matchType: 'contains', name: 'first' },
      { isActive: true, keyword: 'hi there', matchType: 'contains', name: 'second' },
    ];
    expect(matchAutoReplyRule('hi there', overlapping)?.name).toBe('first');
  });

  test('returns null when nothing matches', () => {
    expect(matchAutoReplyRule('unrelated message', rules)).toBeNull();
  });
});

describe('autoReply.resolveReplyDelayMs', () => {
  test('uses the configured delaySeconds when a valid non-negative number is given', () => {
    expect(resolveReplyDelayMs({ delaySeconds: 3 })).toBe(3000);
    expect(resolveReplyDelayMs({ delaySeconds: 0 })).toBe(0);
  });

  test('falls back to a random 2-5s delay when delaySeconds is missing or invalid', () => {
    for (const rule of [{}, { delaySeconds: -1 }, { delaySeconds: 'not-a-number' }, undefined]) {
      const delay = resolveReplyDelayMs(rule);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(5000);
      expect(delay % 1000).toBe(0);
    }
  });
});
