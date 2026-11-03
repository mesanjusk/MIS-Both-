import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PendingBills, { hasInvoiceLines, removeBilledOrder } from './PendingBills';
import { fetchPendingBills } from '../services/orderService';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userName: 'billing-tester' }),
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
    await screen.findByText('Test Customer');
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create Bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish invoice' }));
    await waitFor(() => expect(screen.queryByText('Test Customer')).toBeNull());
    expect(screen.getByText(/No pending bills/)).toBeInTheDocument();
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);

    view.unmount();
    render(<PendingBills />);
    await waitFor(() => expect(screen.getByText(/No pending bills/)).toBeInTheDocument());
    expect(fetchPendingBills).toHaveBeenCalledTimes(1);
  });

  test('refresh explicitly rechecks the backend even with a warm cache', async () => {
    render(<PendingBills />);
    await screen.findByText('Test Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchPendingBills).toHaveBeenCalledTimes(2));
  });
});
