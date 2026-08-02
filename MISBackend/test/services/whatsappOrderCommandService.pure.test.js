const {
  parseAmountFromText,
  nextStageFor,
  isOrderInScope,
  truncate,
  formatDate,
  formatAmount,
} = require('../../src/services/whatsappOrderCommandService');

describe('whatsappOrderCommandService.parseAmountFromText', () => {
  test('parses a plain number', () => {
    expect(parseAmountFromText('500')).toBe(500);
  });

  test('strips currency symbol, commas and whitespace', () => {
    expect(parseAmountFromText('₹ 1,234.50')).toBe(1234.5);
  });

  test('rounds to 2 decimal places', () => {
    expect(parseAmountFromText('10.005')).toBeCloseTo(10.01, 2);
  });

  test('returns null for zero, negative, or non-numeric input', () => {
    expect(parseAmountFromText('0')).toBeNull();
    expect(parseAmountFromText('-50')).toBeNull();
    expect(parseAmountFromText('not a number')).toBeNull();
    expect(parseAmountFromText('')).toBeNull();
    expect(parseAmountFromText(undefined)).toBeNull();
  });
});

describe('whatsappOrderCommandService.nextStageFor', () => {
  test('returns the immediate next stage for an open order', () => {
    expect(nextStageFor({ stage: 'enquiry' })).toBe('quoted');
    expect(nextStageFor({ stage: 'print' })).toBe('fitting');
  });

  test('skips lost/cancelled as automatic "next" suggestions', () => {
    // ready -> delivered is the real next production stage, never the
    // terminal lost/cancelled exits even though they sit later in the list.
    expect(nextStageFor({ stage: 'ready' })).toBe('delivered');
  });

  test('returns null for a stage that is already closed', () => {
    for (const stage of ['delivered', 'paid', 'lost', 'cancelled']) {
      expect(nextStageFor({ stage })).toBeNull();
    }
  });

  test('returns null for an unrecognized stage', () => {
    expect(nextStageFor({ stage: 'not_a_real_stage' })).toBeNull();
  });
});

describe('whatsappOrderCommandService.isOrderInScope', () => {
  test('a viewScope of "all" can see any order regardless of assignment', () => {
    expect(isOrderInScope({ assignedTo: null }, { _id: 'user-1' }, { viewScope: 'all' })).toBe(true);
    expect(isOrderInScope({ assignedTo: 'someone-else' }, { _id: 'user-1' }, { viewScope: 'all' })).toBe(true);
  });

  test('a restricted user can only see an order assigned to them', () => {
    expect(isOrderInScope({ assignedTo: 'user-1' }, { _id: 'user-1' }, { viewScope: 'assigned' })).toBe(true);
  });

  test('a restricted user cannot see an order assigned to someone else', () => {
    expect(isOrderInScope({ assignedTo: 'user-2' }, { _id: 'user-1' }, { viewScope: 'assigned' })).toBe(false);
  });

  test('a restricted user cannot see an unassigned order', () => {
    expect(isOrderInScope({ assignedTo: null }, { _id: 'user-1' }, { viewScope: 'assigned' })).toBe(false);
  });

  test('compares assignedTo/_id as strings (e.g. ObjectId vs string mismatch)', () => {
    const assignedTo = { toString: () => 'user-1' };
    const userId = { toString: () => 'user-1' };
    expect(isOrderInScope({ assignedTo }, { _id: userId }, { viewScope: 'assigned' })).toBe(true);
  });
});

describe('whatsappOrderCommandService.truncate', () => {
  test('returns the string unchanged when within the max length', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  test('truncates and appends an ellipsis when over the max length', () => {
    expect(truncate('a very long string indeed', 10)).toBe('a very lo…');
    expect(truncate('a very long string indeed', 10).length).toBe(10);
  });

  test('trims whitespace before measuring/truncating', () => {
    expect(truncate('  padded  ', 20)).toBe('padded');
  });

  test('handles null/undefined gracefully', () => {
    expect(truncate(null, 10)).toBe('');
    expect(truncate(undefined, 10)).toBe('');
  });
});

describe('whatsappOrderCommandService.formatDate', () => {
  test('formats a date value using en-IN locale', () => {
    expect(formatDate('2026-03-05')).toBe(new Date('2026-03-05').toLocaleDateString('en-IN'));
  });

  test('returns "not set" for a falsy value', () => {
    expect(formatDate(null)).toBe('not set');
    expect(formatDate(undefined)).toBe('not set');
    expect(formatDate('')).toBe('not set');
  });
});

describe('whatsappOrderCommandService.formatAmount', () => {
  test('prefers Amount over saleSubtotal', () => {
    expect(formatAmount({ Amount: 100, saleSubtotal: 200 })).toBe(100);
  });

  test('falls back to saleSubtotal when Amount is absent', () => {
    expect(formatAmount({ saleSubtotal: 200 })).toBe(200);
  });

  test('defaults to 0 when neither field is present', () => {
    expect(formatAmount({})).toBe(0);
  });
});
