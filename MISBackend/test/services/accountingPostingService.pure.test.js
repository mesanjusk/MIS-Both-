const {
  money,
  resolvePaymentAccountName,
  validateBalancedJournal,
} = require('../../src/services/accountingPostingService');

describe('accountingPostingService.money', () => {
  test('parses a plain number', () => {
    expect(money(1234.5)).toBe(1234.5);
  });

  test('strips currency symbol, commas and whitespace', () => {
    expect(money('₹ 1,234.50 ')).toBe(1234.5);
  });

  test('rounds to 2 decimal places', () => {
    expect(money(10.005)).toBeCloseTo(10.01, 2);
    expect(money('10.999')).toBe(11);
  });

  test('returns 0 for garbage input', () => {
    expect(money('not a number')).toBe(0);
    expect(money(undefined)).toBe(0);
    expect(money(null)).toBe(0);
  });
});

describe('accountingPostingService.resolvePaymentAccountName', () => {
  test.each([
    ['UPI', 'UPI'],
    ['PhonePe', 'UPI'],
    ['Google Pay', 'UPI'],
    ['Paytm', 'UPI'],
  ])('routes %s to the UPI account', (mode, expected) => {
    expect(resolvePaymentAccountName(mode)).toBe(expected);
  });

  test.each([
    ['Bank Transfer', 'Bank'],
    ['NEFT', 'Bank'],
    ['RTGS', 'Bank'],
    ['IMPS', 'Bank'],
    ['Cheque', 'Bank'],
  ])('routes %s to the Bank account', (mode, expected) => {
    expect(resolvePaymentAccountName(mode)).toBe(expected);
  });

  test('defaults anything else (including Cash) to the Cash account', () => {
    expect(resolvePaymentAccountName('Cash')).toBe('Cash');
    expect(resolvePaymentAccountName('')).toBe('Cash');
    expect(resolvePaymentAccountName(undefined)).toBe('Cash');
  });
});

describe('accountingPostingService.validateBalancedJournal', () => {
  test('accepts a balanced two-line journal and returns the totals', () => {
    const totals = validateBalancedJournal([
      { Type: 'Debit', Amount: 500 },
      { Type: 'Credit', Amount: 500 },
    ]);
    expect(totals).toEqual({ debit: 500, credit: 500 });
  });

  test('accepts a balanced multi-line journal (split across several debits/credits)', () => {
    const totals = validateBalancedJournal([
      { Type: 'Debit', Amount: 300 },
      { Type: 'Debit', Amount: 200 },
      { Type: 'Credit', Amount: 500 },
    ]);
    expect(totals).toEqual({ debit: 500, credit: 500 });
  });

  test('rejects an unbalanced journal', () => {
    expect(() =>
      validateBalancedJournal([
        { Type: 'Debit', Amount: 500 },
        { Type: 'Credit', Amount: 400 },
      ])
    ).toThrow(/not balanced/i);
  });

  test('rejects fewer than two lines', () => {
    expect(() => validateBalancedJournal([{ Type: 'Debit', Amount: 500 }])).toThrow(/at least one debit and one credit/i);
    expect(() => validateBalancedJournal([])).toThrow(/at least one debit and one credit/i);
  });

  test('rejects a line with a zero or negative amount', () => {
    expect(() =>
      validateBalancedJournal([
        { Type: 'Debit', Amount: 0 },
        { Type: 'Credit', Amount: 0 },
      ])
    ).toThrow(/greater than zero/i);
  });

  test('normalizes Type values that start with d/c in any case', () => {
    const totals = validateBalancedJournal([
      { Type: 'debit', Amount: 100 },
      { Type: 'CREDIT', Amount: 100 },
    ]);
    expect(totals).toEqual({ debit: 100, credit: 100 });
  });
});
