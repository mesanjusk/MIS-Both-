import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('../apiClient.js', () => ({ default: { get: (...a) => get(...a), post: (...a) => post(...a) } }));
vi.mock('./Toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('jspdf', () => ({ jsPDF: class {} }));
vi.mock('html2canvas', () => ({ default: vi.fn() }));

const TransactionDocumentModal = (await import('./TransactionDocumentModal')).default;

const baseProfile = {
  storeName: 'S.K. Digital',
  addressLines: ['Gondia'],
  phone: '',
  email: '',
  gst: '',
};

const receiptEntry = { Account_id: 'cust-1', Type: 'Credit', Amount: 2000 };
const debitEntry = { Account_id: 'cust-1', Type: 'Debit', Amount: 3500 };

function renderModal(props) {
  return render(
    <TransactionDocumentModal
      open
      onClose={() => {}}
      partyName="Acme Traders"
      {...props}
    />
  );
}

describe('TransactionDocumentModal', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('shows the shared invoice for an order-backed transaction', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        result: {
          ...baseProfile,
          docType: 'invoice',
          shareToken: 'tok123',
          orderNumber: '4021',
          partyName: 'Acme Traders',
          dateStr: '01/08/2026',
          items: [{ Item: 'Visiting Cards', Quantity: 2, Rate: 500, Amount: 1000 }],
          extraCharges: [],
          grandTotal: 1000,
        },
      },
    });

    renderModal({
      transaction: { Transaction_id: 12, Transaction_uuid: 'txn-1', Order_number: 4021, Transaction_date: '2026-08-01' },
      entry: debitEntry,
    });

    await waitFor(() => expect(screen.getByText('Invoice #4021')).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith('/api/public-invoices/by-order/4021');
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText('Visiting Cards')).toBeInTheDocument();
    expect(screen.getByText(/\/invoice\/tok123$/)).toBeInTheDocument();
  });

  it('builds a receipt voucher for a payment entry with no order', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        result: {
          ...baseProfile,
          docType: 'receipt',
          voucherType: 'receipt',
          shareToken: 'tok456',
          transactionId: '77',
          partyName: 'Acme Traders',
          dateStr: '05/08/2026',
          amount: 2000,
          grandTotal: 2000,
          paymentMode: 'Cash',
          narration: 'Payment received',
        },
      },
    });

    renderModal({
      transaction: { Transaction_id: 77, Transaction_uuid: 'txn-2', Order_number: null, Transaction_date: '2026-08-05', Description: 'Payment received' },
      entry: receiptEntry,
      counterAccountName: 'Cash',
    });

    await waitFor(() => expect(screen.getByText('Receipt Voucher #77')).toBeInTheDocument());
    expect(get).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/api/public-invoices/receipt', expect.objectContaining({
      transactionUuid: 'txn-2',
      voucherType: 'receipt',
      amount: 2000,
      paymentMode: 'Cash',
    }));
    expect(screen.getByText('RECEIPT VOUCHER')).toBeInTheDocument();
    expect(screen.getByText('Rupees Two Thousand Only')).toBeInTheDocument();
  });

  it('labels a debit against cash as a payment voucher', async () => {
    post.mockResolvedValue({ data: { success: true, result: { ...baseProfile, docType: 'receipt', voucherType: 'payment', shareToken: 't', transactionId: '9', amount: 3500, grandTotal: 3500 } } });

    renderModal({
      transaction: { Transaction_id: 9, Transaction_uuid: 'txn-3', Transaction_date: '2026-08-06' },
      entry: debitEntry,
      counterIsCashOrBank: true,
    });

    await waitFor(() => expect(screen.getByText('PAYMENT VOUCHER')).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith('/api/public-invoices/receipt', expect.objectContaining({ voucherType: 'payment' }));
  });

  it('falls back to a neutral voucher for a debit that is not a cash payment', async () => {
    post.mockResolvedValue({ data: { success: true, result: { ...baseProfile, docType: 'receipt', voucherType: 'journal', shareToken: 't', transactionId: '10', amount: 3500, grandTotal: 3500 } } });

    renderModal({
      transaction: { Transaction_id: 10, Transaction_uuid: 'txn-4', Transaction_date: '2026-08-07' },
      entry: debitEntry,
      counterIsCashOrBank: false,
    });

    await waitFor(() => expect(screen.getByText('TRANSACTION VOUCHER')).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith('/api/public-invoices/receipt', expect.objectContaining({ voucherType: 'journal' }));
  });

  it('falls back to a voucher when the order has no shared invoice yet', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    post.mockResolvedValue({ data: { success: true, result: { ...baseProfile, docType: 'receipt', voucherType: 'receipt', shareToken: 't', transactionId: '11', amount: 2000, grandTotal: 2000 } } });

    renderModal({
      transaction: { Transaction_id: 11, Transaction_uuid: 'txn-5', Order_number: 5000, Transaction_date: '2026-08-08' },
      entry: receiptEntry,
    });

    await waitFor(() => expect(screen.getByText('RECEIPT VOUCHER')).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith('/api/public-invoices/by-order/5000');
    expect(post).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<TransactionDocumentModal open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
