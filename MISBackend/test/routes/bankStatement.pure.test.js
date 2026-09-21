const {
  toAmt,
  parseDateStr,
  normHeader,
  parseSbiCsv,
  chooseBankLedgerDoc,
  scoreBankLedgerName,
  transactionMatchesBankEntry,
} = require('../../src/routes/BankStatement');

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


describe('BankStatement bank ledger name matching', () => {
  test('matches a statement holder name to a ledger with UPI prefix', () => {
    expect(scoreBankLedgerName('SANJU SK', 'UPI Sanju Sk')).toBeGreaterThanOrEqual(70);
  });

  test('does not confuse unrelated bank ledgers', () => {
    expect(scoreBankLedgerName('SANJU SK', 'HDFC Card')).toBeLessThan(70);
  });

  test('prefers UPI Sanju Sk over another bank ledger for SANJU SK', () => {
    const docs = [
      { Customer_uuid: 'hdfc', Customer_name: 'HDFC Card' },
      { Customer_uuid: 'upi', Customer_name: 'UPI Sanju Sk' },
    ];
    expect(chooseBankLedgerDoc('SANJU SK', docs, { allowFallback: false })).toEqual(docs[1]);
  });
});

describe('BankStatement bank-ledger reconciliation helpers', () => {
  test('chooses the configured non-cash bank ledger and ignores cash ledgers', () => {
    const docs = [
      { Customer_uuid: 'cash-uuid', Customer_name: 'Office Cash' },
      { Customer_uuid: 'bank-uuid', Customer_name: 'UPI Sanju Sk' },
    ];

    expect(chooseBankLedgerDoc('SBI Bank Account', docs)).toEqual(docs[1]);
  });

  test('prefers an exact statement account-name match when multiple bank ledgers exist', () => {
    const docs = [
      { Customer_uuid: 'one', Customer_name: 'UPI Sanju Sk' },
      { Customer_uuid: 'two', Customer_name: 'SBI Current Account' },
    ];

    expect(chooseBankLedgerDoc('SBI Current Account', docs)).toEqual(docs[1]);
  });

  test('matches an existing ledger transaction by date-side account and amount shape', () => {
    const transaction = {
      Source: 'diary:day-1:entry-1',
      Journal_entry: [
        { Account_id: 'bank-uuid', Account_name: 'UPI Sanju Sk', Type: 'Debit', Amount: 4500 },
        { Account_id: 'party-uuid', Account_name: 'Sk Sai', Type: 'Credit', Amount: 4500 },
      ],
    };
    const entry = {
      direction: 'in',
      credit: 4500,
      debit: 0,
      account_assigned: 'Sk Sai',
    };

    expect(transactionMatchesBankEntry(
      transaction,
      entry,
      { uuid: 'bank-uuid', name: 'UPI Sanju Sk' },
      { uuid: 'party-uuid', name: 'Sk Sai' }
    )).toBe(true);
  });

  test('does not match a bank-statement-owned posting as an existing business entry', () => {
    const transaction = {
      Source: 'business:bank_statement:stmt:entry',
      Journal_entry: [
        { Account_id: 'bank-uuid', Account_name: 'UPI Sanju Sk', Type: 'Debit', Amount: 100 },
        { Account_id: 'party-uuid', Account_name: 'Gpay Cash', Type: 'Credit', Amount: 100 },
      ],
    };
    const entry = {
      direction: 'in',
      credit: 100,
      debit: 0,
      account_assigned: 'Gpay Cash',
    };

    expect(transactionMatchesBankEntry(
      transaction,
      entry,
      { uuid: 'bank-uuid', name: 'UPI Sanju Sk' },
      { uuid: 'party-uuid', name: 'Gpay Cash' }
    )).toBe(false);
  });
});
