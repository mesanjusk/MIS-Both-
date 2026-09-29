import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmployeeSopDialog from './EmployeeSopDialog';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../apiClient', () => ({ default: api }));

const status = {
  success: true, hasStarted: true, hasEnded: false, totalCount: 3,
  completedCount: 1, canEndDay: false,
  completionMap: { punch: { autoVerified: true, evidence: 'Attendance: In' } },
  handoverMap: {}, exceptions: [],
  blockingTasks: [{ sop_uuid: 'files', title: 'Save active design files' }],
  tasks: [
    { sop_uuid: 'punch', title: 'Mark attendance & login to MIS',
      timeOfDay: 'morning', scope: 'group', isSkippable: false },
    { sop_uuid: 'files', title: 'Save active design files',
      timeOfDay: 'evening', scope: 'personal', isSkippable: false },
    { sop_uuid: 'quote', title: 'Send quotation if needed',
      timeOfDay: 'during_day', scope: 'group', isSkippable: true },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: status });
  api.post.mockResolvedValue({ data: { success: true, result: {} } });
});

describe('employee morning and closing SOP popup', () => {
  it('shows auto-verified Punch In in the morning with other tasks available by phase', async () => {
    render(<EmployeeSopDialog open mode="start" onClose={() => {}} />);
    expect(await screen.findByText('Mark attendance & login to MIS')).toBeInTheDocument();
    expect(screen.getByText('Auto-verified · Punch In')).toBeInTheDocument();
    expect(screen.queryByText('Save active design files')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Closing' }));
    expect(screen.getByText('Save active design files')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blocked / Handover' })).toBeInTheDocument();
  });

  it('keeps normal Punch Out blocked until mandatory tasks are finished or handed over', async () => {
    const onPunchOut = vi.fn();
    render(<EmployeeSopDialog open mode="close" onClose={() => {}} onPunchOut={onPunchOut} />);
    await screen.findByText('Save active design files');
    expect(screen.getByRole('button', { name: 'Punch Out' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Emergency clock-out with reason' }));
    const text = screen.getByRole('textbox', { name: /Emergency reason/i });
    fireEvent.change(text, { target: { value: 'Unexpected family emergency, leaving now' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record exception & Punch Out' }));
    await waitFor(() => expect(onPunchOut).toHaveBeenCalledWith(
      'Unexpected family emergency, leaving now'
    ));
  });

  it('stores a documented handover rather than falsely marking mandatory work completed', async () => {
    render(<EmployeeSopDialog open mode="close" onClose={() => {}} onPunchOut={() => {}} />);
    await screen.findByText('Save active design files');
    // Closing can show several pending rows. The first belongs to the
    // mandatory design-file SOP in this fixture.
    fireEvent.click(screen.getAllByRole('button', { name: 'Blocked / Handover' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Waiting for customer approval' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sop/handover', {
      sopUuid: 'files', reason: 'Waiting for customer approval', assignedTo: 'Manager',
    }));
    expect(api.post).not.toHaveBeenCalledWith('/api/sop/complete', expect.anything());
  });

  it('offers N/A only for optional work', async () => {
    render(<EmployeeSopDialog open mode="day" onClose={() => {}} />);
    await screen.findByText('Mark attendance & login to MIS');
    fireEvent.click(screen.getByRole('button', { name: 'During work' }));
    expect(screen.getByText('Send quotation if needed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'N/A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sop/skip', {
      sopUuid: 'quote', skipReason: 'No applicable work today',
    }));
  });
});
