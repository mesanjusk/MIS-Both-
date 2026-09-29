import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConfirmFinalMasterAddDialog from './ConfirmFinalMasterAddDialog';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../apiClient', () => ({ default: api }));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes('customergroup')) return Promise.resolve({ data: {
      success: true, result: [{ Customer_group: 'Account Receivable' }],
    } });
    return Promise.resolve({ data: { success: true, result: [{ Item_group: 'Printing' }] } });
  });
  api.post.mockResolvedValue({ data: { success: true, result: { Item_uuid: 'new-item', Item_name: 'New Item' } } });
});

describe('inline master add dialogs', () => {
  it('creates a customer using the existing customer API without creating an order', async () => {
    const onCreated = vi.fn();
    render(<ConfirmFinalMasterAddDialog kind="customer" onCreated={onCreated} onClose={() => {}} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'New Customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/customers/addCustomer',
      expect.objectContaining({ Customer_name: 'New Customer', Customer_group: 'Account Receivable',
        Status: 'active', PartyRoles: ['customer'] })));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ kind: 'customer', name: 'New Customer' }));
  });

  it('creates an assignable payable party tagged for the selected stage capability', async () => {
    render(<ConfirmFinalMasterAddDialog kind="assignee" stageCapability="postprint"
      onCreated={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Worker A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Assignee' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/customers/addCustomer',
      expect.objectContaining({ Customer_name: 'Worker A', Customer_group: 'Account Payable',
        Capabilities: ['postprint'], PartyRoles: ['vendor'] })));
  });

  it('creates an item in the actual item master with no invented sale value', async () => {
    render(<ConfirmFinalMasterAddDialog kind="item" onCreated={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('textbox', { name: 'New item name' }), { target: { value: 'New Item' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/items/addItem',
      expect.objectContaining({ Item_name: 'New Item', Item_group: 'Printing', defaultSaleRate: 0 })));
  });

  it('maps custom display labels to canonical workflow stages rather than extending the order enum', async () => {
    render(<ConfirmFinalMasterAddDialog kind="stage" stage="print"
      stageOptions={[{ value: 'print', label: 'Print' }]} onCreated={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Stage shortcut name' }), { target: { value: 'UV Print' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Shortcut' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/design-files/confirm-stage-shortcuts',
      { label: 'UV Print', canonicalStage: 'print' }));
  });
});
