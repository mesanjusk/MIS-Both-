import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Home from './home';
import PaymentFollowupHome from './PaymentFollowupHome';

const get = vi.hoisted(() => vi.fn((url) => {
  if (url.includes('/paymentfollowup/balance/')) return Promise.resolve({ data: {
    success: true, result: { outstanding: 2000 },
  } });
  if (url.includes('/paymentfollowup/list')) return Promise.resolve({ data: {
    success: true, result: [{
      _id: 'followup-1', customer_name: 'Customer One', customer_uuid: 'customer-1',
      amount: 1000, remainingAmount: 500, liveOutstanding: 2000,
      effectiveStatus: 'pending', status: 'pending', overdue: true, dueToday: false,
      followup_date: '2026-09-28T06:30:00Z', assigned_to: 'Asha',
      title: 'Invoice 12', customer_mobile: '919876543210',
    }],
  } });
  if (url.includes('/customers/GetCustomersList')) return Promise.resolve({ data: {
    success: true, result: [{ Customer_uuid: 'customer-1', Customer_name: 'Customer One' }],
  } });
  return Promise.resolve({ data: { success: true, result: [] } });
}));

vi.mock('../apiClient', () => ({
  default: { get, post: vi.fn(), patch: vi.fn() },
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userName: 'tester', permissions: { canViewAccounts: true } }),
}));
vi.mock('../Components/dashboard/WorkflowWidget', () => ({
  default: () => <div>Workflow</div>,
}));

describe('Home payment follow-up integration', () => {
  it('places the Accounts-only follow-up tab immediately after Rate Calculator', async () => {
    render(<MemoryRouter initialEntries={['/home']}><Home /></MemoryRouter>);
    const tabs = await screen.findAllByRole('tab');
    const names = tabs.map((tab) => tab.textContent.trim());
    expect(names[names.indexOf('Rate Calculator') + 1]).toBe('Payment Follow-up');
  });

  it('preselects a customer passed from Home Outstanding by UUID', async () => {
    render(<PaymentFollowupHome initialCustomerUuid="customer-1" prefillKey="outstanding-nav" />);
    await waitFor(() => expect(get).toHaveBeenCalledWith(
      '/api/paymentfollowup/balance/customer-1', expect.objectContaining({ cache: false }),
    ));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Customer/i })).toHaveValue('Customer One'));
  });

  it('shows actual follow-ups, remaining balance and management controls', async () => {
    render(<PaymentFollowupHome />);
    expect(await screen.findByText('Customer One')).toBeInTheDocument();
    expect(screen.getByText('Invoice 12')).toBeInTheDocument();
    // Appears in both the outstanding summary card and the matching table row.
    expect(screen.getAllByText('₹500').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /Manage/i })).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledWith(
      '/api/paymentfollowup/list', expect.objectContaining({ cache: false }),
    ));
  });
});
