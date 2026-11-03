import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PendingBills, { hasInvoiceLines, removeBilledOrder } from './PendingBills';
import { fetchPendingBills } from '../services/orderService';
import { clearArchiveCache, writeArchiveCache } from '../Components/dashboard/archiveBrowserCache';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userName: 'billing-tester' }),
}));
vi.mock('../Components/dashboard/DesignFilesWidget', () => ({
  ConfirmFinalDialog: ({ onSuccess }) => (
    <button type="button" onClick={() => onSuccess('Confirmed in MIS', 'success', {
      fileId: 'archive-file-1', orderNumber: 456, orderUuid: 'archive-order-1',
    })}>Finish archive confirmation</button>
  ),
}));
vi.mock('../services/orderService', () => ({
  fetchPendingBills: vi.fn(),
}));
vi.mock('./updateDelivery', () => ({
  default: ({ onSaved }) => (
    <button type="button" onClick={() => onSaved({ Order_uuid: 'uuid-1' })}>Finish invoice</button>
  ),
}));

const delivered = {
  _id: 'mongo-1',
  Order_uuid: 'uuid-1',
  Order_Number: 123,
  Customer_name: 'Test Customer',
  orderNote: 'Sign board',
  createdAt: '2026-11-01T10:00:00Z',
  Items: [],
  stage: 'delivered',
};

beforeEach(() => {
  sessionStorage.clear();
  clearArchiveCache('billing-tester');
  writeArchiveCache('billing-tester', { success: true, dates: [], months: [] });
  vi.mocked(fetchPendingBills).mockReset();
  vi.mocked(fetchPendingBills).mockResolvedValue({
    data: { success: true, result: [delivered], total: 1, hasMore: false },
  });
});

afterEach(() => cleanup());

describe('Pending Bills', () => {
  test('only positive invoice lines qualify as billed', () => {
    expect(hasInvoiceLines([])).toBe(false);
    expect(hasInvoiceLines([{ Amount: 0 }])).toBe(false);
    expect(hasInvoiceLines([{ Amount: '125' }])).toBe(true);
    expect(removeBilledOrder([delivered], 'uuid-1')).toEqual([]);
    expect(removeBilledOrder([delivered], 'mongo-1')).toEqual([]);
  });

  test('creates a bill in the existing popup, removes the row locally, and reuses browser cache', async () => {
    const view = render(<PendingBills />);
    fireEvent.click(screen.getByRole('button', { name: /Delivered, Not Invoiced/ }));
    await screen.findByText('Test Customer');
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish invoice' }));
    await waitFor(() => expect(screen.queryByText('Test Customer')).toBeNull());
    expect(screen.getByText(/No pending bills/)).toBeInTheDocument();
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);

    view.unmount();
    render(<PendingBills />);
    fireEvent.click(screen.getByRole('button', { name: /Delivered, Not Invoiced/ }));
    await waitFor(() => expect(screen.getByText(/No pending bills/)).toBeInTheDocument());
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);
  });

  test('refresh explicitly rechecks the backend even with a warm cache', async () => {
    render(<PendingBills />);
    fireEvent.click(screen.getByRole('button', { name: /Delivered, Not Invoiced/ }));
    await screen.findByText('Test Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchPendingBills).toHaveBeenCalledTimes(2));
  });
  test('shows exactly the archived pending confirmations and updates the shared browser cache on success', async () => {
    writeArchiveCache('billing-tester', {
      success: true, months: ['November 2026'],
      dates: [{
        monthName: 'November 2026', dateName: '03 Nov', sections: [{
          sectionName: 'Final', stageNumber: 5,
          files: [
            { fileId: 'archive-file-1', fileName: 'Needs confirmation.cdr', matched: false },
            { fileId: 'archive-file-2', fileName: 'Already confirmed.cdr', matched: true },
          ],
        }],
      }],
    });

    const view = render(<PendingBills />);
    expect(await screen.findByText('Needs confirmation.cdr')).toBeInTheDocument();
    expect(screen.queryByText('Already confirmed.cdr')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm MIS Order' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finish archive confirmation' }));

    await waitFor(() => expect(screen.queryByText('Needs confirmation.cdr')).toBeNull());
    expect(screen.getByText(/All archived files are confirmed/)).toBeInTheDocument();
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);
    view.unmount();

    render(<PendingBills />);
    expect(screen.getByText(/All archived files are confirmed/)).toBeInTheDocument();
    expect(screen.queryByText('Needs confirmation.cdr')).toBeNull();
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);
  });

  test('shows non-Final archive files without an incorrect confirmation action', async () => {
    writeArchiveCache('billing-tester', {
      success: true, dates: [{
        monthName: 'October 2026', dateName: '30 Oct',
        sections: [{ sectionName: 'Loose files', stageNumber: null,
          files: [{ fileId: 'loose-1', fileName: 'Loose file.cdr', matched: false }] }],
      }],
    });
    render(<PendingBills />);
    expect(await screen.findByText('Loose file.cdr')).toBeInTheDocument();
    expect(screen.getByText(/Review in Workflow/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm MIS Order' })).toBeNull();
  });

});
