import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StatementDescriptionEditModal from './StatementDescriptionEditModal';

const transaction = { Transaction_uuid: 'txn-861', Transaction_id: 861, Description: 'Info Origin' };

beforeEach(() => vi.clearAllMocks());

describe('Statement Edit popup', () => {
  it('allows an admin to change only the narration and save it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<StatementDescriptionEditModal transaction={transaction} partyName="Info Origin"
      onSave={onSave} onClose={() => {}} onFullEdit={() => {}} />);
    const field = screen.getByRole('textbox', { name: /Description \/ Voucher Narration/i });
    expect(field).toHaveValue('Info Origin');
    fireEvent.change(field, { target: { value: 'Wedding cards and envelopes' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Description/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Wedding cards and envelopes'));
  });

  it('retains the original full invoice editor and displays invoice item details read-only', () => {
    const onFullEdit = vi.fn();
    render(<StatementDescriptionEditModal transaction={transaction} partyName="Info Origin"
      isInvoice invoiceDetails={{ items: [{
        name: 'Wedding Card', quantity: 100, rate: 12, amount: 1200, remark: 'Matte',
      }] }}
      onSave={() => {}} onClose={() => {}} onFullEdit={onFullEdit} />);
    expect(screen.getByText(/Wedding Card × 100/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Edit Invoice Items \/ Rates/i }));
    expect(onFullEdit).toHaveBeenCalledTimes(1);
  });

  it('does not save a blank narration or block the existing full transaction editor', () => {
    const onSave = vi.fn();
    const onFullEdit = vi.fn();
    render(<StatementDescriptionEditModal transaction={transaction}
      onSave={onSave} onFullEdit={onFullEdit} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Description \/ Voucher Narration/i }),
      { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: /Save Description/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Edit Full Transaction/i }));
    expect(onFullEdit).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
