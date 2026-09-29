import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmFinalDialog } from './DesignFilesWidget';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), assignees: vi.fn() }));
vi.mock('../../apiClient', () => ({ default: { get: api.get, post: api.post } }));
vi.mock('../../services/assigneeService', () => ({ fetchAssignees: api.assignees }));

const archiveFinal = { fileId: 'final-1', fileName: 'Sample Final.cdr', stageNumber: 5, matched: false };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes('GetCustomerList')) return Promise.resolve({ data: { success: true,
      result: [{ Customer_uuid: 'c-1', Customer_name: 'Existing Customer', Mobile: '' }] } });
    if (url.includes('GetItemList')) return Promise.resolve({ data: { success: true,
      result: [{ Item_uuid: 'i-1', Item_name: 'Existing Item' }] } });
    return Promise.resolve({ data: { success: true, result: [] } });
  });
  api.assignees.mockResolvedValue({ data: { result: [] } });
});

describe('existing archive Confirm as MIS Order form', () => {
  it('preserves all existing modes and puts the requested + beside the four fields', async () => {
    render(<ConfirmFinalDialog open fromArchive file={archiveFinal}
      onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/items/GetItemList'));
    expect(screen.getByText('Confirm Final File → Create Order')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add new customer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add stage shortcut' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add new assignable party' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add new item to master' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simple Note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detailed Items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm & Create Order' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Detailed Items' }));
    expect(screen.getByRole('button', { name: 'Add new item beside row 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort A→Z' })).toBeInTheDocument();
    expect(screen.getByText('Additional Charges')).toBeInTheDocument();
    expect(screen.getByText('Grand Total')).toBeInTheDocument();
  });

  it('adds a new item from the inline + then refreshes and selects it without leaving Confirm Final', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('GetCustomerList')) return Promise.resolve({ data: { result: [] } });
      if (url.includes('GetItemList')) return Promise.resolve({ data: { result: [
        { Item_uuid: 'new-item', Item_name: 'Premium Card' },
      ] } });
      if (url.includes('GetItemgroupList')) return Promise.resolve({ data: { result: [
        { Item_group: 'Printing' },
      ] } });
      return Promise.resolve({ data: { result: [] } });
    });
    api.post.mockResolvedValue({ data: { success: true, result: {
      Item_uuid: 'new-item', Item_name: 'Premium Card',
    } } });
    render(<ConfirmFinalDialog open fromArchive file={archiveFinal}
      onClose={() => {}} onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Detailed Items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add new item beside row 1' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'New item name' }),
      { target: { value: 'Premium Card' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/items/addItem',
      expect.objectContaining({ Item_name: 'Premium Card' })));
    // MUI keeps the parent dialog aria-hidden until the nested modal finishes
    // its exit transition. Wait for the original controls to become accessible.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument());
    expect(screen.getByText('Confirm Final File → Create Order')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Premium Card')).toBeInTheDocument();
  });
});
