import { describe, expect, it } from 'vitest';
import { buildStatementPdf, money, statementFileName } from './statementPdf';

const makeRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    txnNo: 2300 + i,
    voucherNo: `INV-${800 + i}`,
    dateStr: '08/08/2026',
    particulars: 'Sales',
    description: 'Online transfer',
    debit: 250,
    credit: 0,
    balance: 250 * (i + 1),
  }));

const profile = {
  name: 'S.K. Digital',
  addressLines: ['Krishnapura Ward, Gondia'],
  phone: '9999999999',
  gst: '27ABCDE1234F1Z5',
  upiId: 'sk@upi',
};

const statement = {
  partyName: 'Praful Manihari',
  partyMobile: '9152525258',
  periodFrom: '01/04/2026',
  periodTo: '31/03/2027',
  generatedOn: '14/09/2026',
  openingBalance: 0,
  totalDebit: 4501,
  totalCredit: 0,
  closingBalance: 4501,
  rows: makeRows(3),
};

// Everything the document draws with a text operator, unescaped.
const textOf = (pdf) =>
  pdf.internal.pages
    .filter(Boolean)
    .flatMap((page) => page.join('\n').match(/\((?:\\.|[^()\\])*\)\s*Tj/g) || [])
    .map((op) => op.replace(/\)\s*Tj$/, '').slice(1).replace(/\\([()\\])/g, '$1'))
    .join('\n');

describe('money', () => {
  it('always shows two decimals in the Indian grouping', () => {
    expect(money(120000.5)).toBe('1,20,000.50');
    expect(money(null)).toBe('0.00');
  });
});

describe('statementFileName', () => {
  it('slugifies the party name', () => {
    expect(statementFileName('Fedback Bank')).toBe('statement-fedback-bank.pdf');
    expect(statementFileName('')).toBe('statement.pdf');
  });
});

describe('buildStatementPdf', () => {
  it('draws the statement as real text on a single A4 page', async () => {
    const pdf = await buildStatementPdf(statement, profile);

    expect(pdf.getNumberOfPages()).toBe(1);
    const { width, height } = pdf.internal.pageSize;
    expect(Math.round(width)).toBe(210);
    expect(Math.round(height)).toBe(297);

    // Text is drawn, not rasterised — so it stays searchable and sharp.
    const content = textOf(pdf);
    expect(content).toContain('ACCOUNT STATEMENT');
    expect(content).toContain('Praful Manihari');
    expect(content).toContain('Page 1 of 1');
    expect(content).not.toContain('/Image');
  });

  it('paginates a long ledger and numbers every page', async () => {
    const pdf = await buildStatementPdf({ ...statement, rows: makeRows(90) }, profile);
    const pages = pdf.getNumberOfPages();

    expect(pages).toBeGreaterThan(1);
    expect(textOf(pdf)).toContain(`Page ${pages} of ${pages}`);
    expect(textOf(pdf)).toContain('Balance brought forward');
  });

  it('says so when the period holds no transactions', async () => {
    const pdf = await buildStatementPdf(
      { ...statement, rows: [], totalDebit: 0, totalCredit: 0, closingBalance: 0 },
      profile
    );
    expect(textOf(pdf)).toContain('No transactions in this period.');
  });

  it('labels an advance instead of a receivable when the balance is negative', async () => {
    const pdf = await buildStatementPdf({ ...statement, closingBalance: -2500 }, profile);
    const content = textOf(pdf);
    expect(content).toContain('CLOSING BALANCE (ADVANCE / PAYABLE)');
    expect(content).not.toContain('CLOSING BALANCE RECEIVABLE');
  });
});
