import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ArchiveQuickOrderDialog from './ArchiveQuickOrderDialog';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  assignees: vi.fn(),
}));

vi.mock('../../apiClient', () => ({
  default: { get: api.get, post: api.post },
}));
vi.mock('../../services/assigneeService', () => ({
  fetchAssignees: api.assignees,
}));

const archiveFile = {
  fileId: 'drive-final-1', fileName: 'Wedding Card.cdr',
  stageNumber: 5, matched: false, isTemporaryOrder: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { result: [
    { Customer_uuid: 'cust-1', Customer_name: 'Acme Cards', Mobile: '9999999999' },
  ] } });
  api.assignees.mockResolvedValue({ data: { result: [
    { id: 'payable-1', name: 'Printer A', type: 'payable', capabilities: ['print'] },
  ] } });
  api.post.mockResolvedValue({ data: { success: true, orderNumber: 2821 } });
});

describe('Archive quick MIS order popup', () => {
  it('shows only the requested order fields and pre-fills item from the file', async () => {
    render(<ArchiveQuickOrderDialog open file={archiveFile} onClose={() => {}} onSuccess={() => {}} />);
    expect(await screen.findByRole('combobox', { name: /customer name/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /stage/i })).toHaveTextContent(/Print/i);
    expect(screen.getByRole('combobox', { name: /assign to/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /new item/i })).toHaveValue('Wedding Card');
  });

  it('creates one zero-priced real item via the existing confirm-final API', async () => {
    const onSuccess = vi.fn();
    render(<ArchiveQuickOrderDialog open file={archiveFile} onClose={() => {}} onSuccess={onSuccess} />);
    const input = await screen.findByRole('combobox', { name: /customer name/i });
    fireEvent.change(input, { target: { value: 'Acme' } });
    fireEvent.click(await screen.findByRole('option', { name: /Acme Cards/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /new item/i }), {
      target: { value: '500 visiting cards' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create MIS Order' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/design-files/confirm-final',
      expect.objectContaining({
        fileId: 'drive-final-1', customerUuid: 'cust-1', fromArchive: true,
        stage: 'print', orderMode: 'items',
        items: [{ itemName: '500 visiting cards', qty: 1, rate: 0, amount: 0, remark: '' }],
      })
    ));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.stringContaining('#2821')));
  });

  it('disables creation for a file already linked to an order', async () => {
    render(<ArchiveQuickOrderDialog open file={{ ...archiveFile, orderUuid: 'existing-order' }}
      onClose={() => {}} onSuccess={() => {}} />);
    await screen.findByRole('combobox', { name: /customer name/i });
    expect(screen.getByRole('button', { name: 'Create MIS Order' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
