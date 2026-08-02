const { toAmt, parseDateStr, normHeader, parseSbiCsv } = require('../../src/routes/BankStatement');

describe('BankStatement.toAmt', () => {
  test('strips currency symbol, commas and whitespace', () => {
    expect(toAmt('₹ 1,234.50')).toBe(1234.5);
  });

  test('returns 0 for empty/falsy input', () => {
    expect(toAmt('')).toBe(0);
    expect(toAmt(null)).toBe(0);
    expect(toAmt(undefined)).toBe(0);
  });

  test('returns 0 for non-numeric text', () => {
    expect(toAmt('n/a')).toBe(0);
  });
});

describe('BankStatement.parseDateStr', () => {
  test('parses DD/MM/YYYY', () => {
    const d = parseDateStr('05/03/2026');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // March
    expect(d.getUTCDate()).toBe(5);
  });

  test('parses DD-MM-YYYY', () => {
    const d = parseDateStr('05-03-2026');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(5);
  });

  test('parses YYYY-MM-DD', () => {
    const d = parseDateStr('2026-03-05');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(5);
  });

  test('returns null for an empty or unparseable string', () => {
    expect(parseDateStr('')).toBeNull();
    expect(parseDateStr('not a date')).toBeNull();
  });
});

describe('BankStatement.normHeader', () => {
  test('lowercases, trims and collapses separators to underscores', () => {
    expect(normHeader(' Txn Date ')).toBe('txn_date');
    expect(normHeader('Value-Date')).toBe('value_date');
  });

  test('does not leave a stray leading/trailing underscore for a header ending in a separator', () => {
    // "Ref No./Cheque No." is the exact column name parseSbiCsv documents as
    // the expected format — its trailing "." must not survive as "_", or the
    // row['ref_no_cheque_no'] lookup in parseSbiCsv silently misses it.
    expect(normHeader('Ref No./Cheque No.')).toBe('ref_no_cheque_no');
  });
});

describe('BankStatement.parseSbiCsv', () => {
  test('parses a well-formed SBI CSV export into entries', () => {
    const csv = [
      'Account Name,Test Business',
      'Txn Date,Value Date,Description,Ref No./Cheque No.,Branch Code,Debit,Credit,Balance',
      '05/03/2026,05/03/2026,NEFT FROM ACME CORP,REF123,1234,0,5000,15000',
      '06/03/2026,06/03/2026,ATM WITHDRAWAL,REF124,1234,2000,0,13000',
    ].join('\n');

    const { entries, error, accountName } = parseSbiCsv(csv);
    expect(error).toBeNull();
    expect(accountName).toBe('Test Business');
    expect(entries).toHaveLength(2);

    expect(entries[0]).toMatchObject({ credit: 5000, debit: 0, direction: 'in', match_status: 'unmatched', ref_no: 'REF123' });
    expect(entries[1]).toMatchObject({ credit: 0, debit: 2000, direction: 'out', ref_no: 'REF124' });
  });

  test('skips rows with no debit and no credit, and rows without a parseable date', () => {
    const csv = [
      'Txn Date,Value Date,Description,Ref No./Cheque No.,Branch Code,Debit,Credit,Balance',
      '05/03/2026,05/03/2026,ZERO MOVEMENT,REF1,1234,0,0,15000',
      ',,MISSING DATE,REF2,1234,100,0,14900',
      '06/03/2026,06/03/2026,VALID ROW,REF3,1234,0,300,15200',
    ].join('\n');

    const { entries } = parseSbiCsv(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe('VALID ROW');
  });

  test('returns an error when no recognizable header row is found', () => {
    const csv = 'just,some,random,csv,text\n1,2,3,4,5';
    const { entries, error } = parseSbiCsv(csv);
    expect(entries).toEqual([]);
    expect(error).toMatch(/header row not found/i);
  });
});
