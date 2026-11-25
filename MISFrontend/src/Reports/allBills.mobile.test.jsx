import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import AllBills from './allBills';
import { fetchBillListPaged, updateBillStatus, updateManualBillStatus } from '../services/orderService';

const auth = vi.hoisted(() => ({ userName: 'Asha', userGroup: 'Accounts', permissions: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/orderService', () => ({ fetchBillListPaged: vi.fn(), updateBillStatus: vi.fn(), updateManualBillStatus: vi.fn() }));
vi.mock('../services/customerService', () => ({
  fetchCustomers: async () => ({ data: { success: true, result: [{ Customer_uuid: 'customer-1', Customer_name: 'Asha Prints' }] } }),
}));
vi.mock('../apiClient', () => ({ default: { get: async () => ({ data: {} }) } }));
vi.mock('../Components', () => ({ LoadingSpinner: () => null }));
vi.mock('../Pages/updateDelivery', () => ({ default: () => null }));
vi.mock('../Pages/AddTransaction', () => ({ default: ({ linkedBill }) => <div>Receipt for #{linkedBill.Order_Number}</div> }));
vi.mock('../Pages/PaymentFollowupHome', () => ({ default: () => null }));
vi.mock('../Components/InvoiceModal', () => ({ default: () => null }));

const order = {
  Order_uuid: 'order-1', Order_Number: 73, Customer_uuid: 'customer-1', createdAt: '2026-11-25T04:00:00Z',
  billStatus: 'unpaid', Items: [{ Item: 'Print', Amount: 350, Quantity: 1, Rate: 350 }],
};

beforeEach(() => {
  auth.userGroup = 'Accounts';
  fetchBillListPaged.mockResolvedValue({ data: { success: true, total: 1, result: [order] } });
});

test('Manual paid and balance toggles do not call the ledger payment endpoint', async () => {
  let current = { ...order };
  fetchBillListPaged.mockImplementation(async () => ({ data: { success: true, total: 1, result: [current] } }));
  updateManualBillStatus.mockImplementation(async (_, paid) => {
    current = { ...current, manualBillPaid: paid };
    return { data: { success: true, result: { manualBillPaid: paid } } };
  });
  render(<AllBills compact />);
  fireEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
  await waitFor(() => expect(updateManualBillStatus).toHaveBeenCalledWith('order-1', true));
  const marked = await screen.findByRole('button', { name: 'Mark balance' });
  await waitFor(() => expect(marked).toBeEnabled());
  fireEvent.click(marked);
  await waitFor(() => expect(updateManualBillStatus).toHaveBeenCalledWith('order-1', false));
  expect(updateBillStatus).not.toHaveBeenCalled();
  expect(screen.queryByText('Receipt for #73')).not.toBeInTheDocument();
});

test.each([['Accounts', false], ['Admin User', true]])('%s bill details respect edit and removal permissions',
  async (role, editable) => {
    auth.userGroup = role;
    render(<AllBills compact />);
    fireEvent.click(await screen.findByRole('button', { name: /Asha Prints/ }));
    await screen.findByRole('dialog');
    for (const name of ['Edit bill', 'Remove from Bills']) {
      expect(Boolean(screen.queryByRole('button', { name }))).toBe(editable);
    }
    expect(screen.getByRole('button', { name: 'View invoice' })).toBeInTheDocument();
  });
