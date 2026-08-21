import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AccountStatement, { paginateStatementRows, ROWS_FIRST_PAGE, ROWS_NEXT_PAGE } from './AccountStatement';

const makeRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    txnNo: 100 + i,
    voucherNo: `INV-${700 + i}`,
    voucherType: 'Invoice',
    dateStr: '23/05/2026',
    particulars: 'Sales',
    description: 'Delivery note',
    debit: 250,
    credit: 0,
    balance: 250 * (i + 1),
  }));

const baseProps = {
  store: 'S.K. Digital',
  addressLines: ['Krishnapura Ward, Gondia'],
  phone: '9999999999',
  gst: '27ABCDE1234F1Z5',
  partyName: 'Praful Manihari',
  periodFrom: '01/04/2026',
  periodTo: '31/03/2027',
  generatedOn: '21/08/2026',
  openingBalance: 0,
  totalDebit: 4501,
  totalCredit: 0,
  closingBalance: 4501,
};

describe('paginateStatementRows', () => {
  it('always returns one page so an empty period still prints', () => {
    expect(paginateStatementRows([])).toEqual([[]]);
  });

  it('keeps a short statement on a single page', () => {
    expect(paginateStatementRows(makeRows(ROWS_FIRST_PAGE))).toHaveLength(1);
  });

  it('spills over to a second page past the first page capacity', () => {
    const pages = paginateStatementRows(makeRows(ROWS_FIRST_PAGE + 1));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(ROWS_FIRST_PAGE);
    expect(pages[1]).toHaveLength(1);
  });

  it('fits more rows on continuation pages and loses none of them', () => {
    const rows = makeRows(ROWS_FIRST_PAGE + ROWS_NEXT_PAGE + 3);
    const pages = paginateStatementRows(rows);
    expect(pages).toHaveLength(3);
    expect(pages.flat()).toHaveLength(rows.length);
    expect(pages.flat()[0]).toBe(rows[0]);
  });
});

describe('AccountStatement', () => {
  it('prints the letterhead, party, period and balances', () => {
    render(<AccountStatement {...baseProps} rows={makeRows(3)} />);

    expect(screen.getByText('ACCOUNT STATEMENT')).toBeInTheDocument();
    expect(screen.getByText('S.K. Digital')).toBeInTheDocument();
    expect(screen.getByText('Krishnapura Ward, Gondia')).toBeInTheDocument();
    expect(screen.getByText('GSTIN: 27ABCDE1234F1Z5')).toBeInTheDocument();
    expect(screen.getByText('Praful Manihari')).toBeInTheDocument();
    expect(screen.getByText('01/04/2026 to 31/03/2027')).toBeInTheDocument();
    expect(screen.getByText('Generated on 21/08/2026')).toBeInTheDocument();
    // once in the summary strip, once as the first table row
    expect(screen.getAllByText('Opening Balance')).toHaveLength(2);
    expect(screen.getByText('Total for the period')).toBeInTheDocument();
    expect(screen.getByText('Closing Balance (Receivable)')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('shows both the transaction number and the voucher number for every row', () => {
    render(<AccountStatement {...baseProps} rows={makeRows(2)} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('INV-700')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('INV-701')).toBeInTheDocument();
  });

  it('carries the balance forward onto each following page', () => {
    const rows = makeRows(ROWS_FIRST_PAGE + 2);
    const { container } = render(<AccountStatement {...baseProps} rows={rows} />);

    expect(container.querySelectorAll('[data-statement-page]')).toHaveLength(2);
    expect(screen.getByText('Balance brought forward')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    // the carried figure is the closing balance of the previous page
    const carried = rows[ROWS_FIRST_PAGE - 1].balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(screen.getAllByText(carried).length).toBeGreaterThan(1);
  });

  it('says so when the period holds no transactions', () => {
    render(<AccountStatement {...baseProps} rows={[]} totalDebit={0} totalCredit={0} closingBalance={0} />);
    expect(screen.getByText('No transactions in this period.')).toBeInTheDocument();
  });

  it('offers a UPI QR only when the party owes money', () => {
    const { rerender, container } = render(<AccountStatement {...baseProps} upiId="sk@upi" rows={makeRows(1)} />);
    expect(screen.getByText('📲 Scan to pay ₹4,501.00')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();

    rerender(<AccountStatement {...baseProps} upiId="sk@upi" closingBalance={-500} rows={makeRows(1)} />);
    expect(screen.queryByText(/Scan to pay/)).not.toBeInTheDocument();
    expect(screen.getByText('Closing Balance (Advance / Payable)')).toBeInTheDocument();
  });

  it('falls back to "All dates" with no period set', () => {
    render(<AccountStatement {...baseProps} periodFrom="" periodTo="" rows={[]} />);
    expect(screen.getByText('All dates')).toBeInTheDocument();
  });
});
