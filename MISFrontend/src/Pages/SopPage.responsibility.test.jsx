import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SopPage from './SopPage';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
const responsibilities = vi.hoisted(() => vi.fn());

vi.mock('../apiClient', () => ({ default: api }));
vi.mock('../services/operationsService', () => ({
  fetchResponsibilities: responsibilities,
}));
vi.mock('../hooks/usePageToggles', () => ({
  usePageToggles: () => ({ togglesLoaded: true, isApiDisabled: () => true }),
}));

const designResponsibility = {
  responsibility_uuid: 'resp-design',
  name: 'Customer Design Proof',
  isActive: true,
  resolution: {
    currentOwner: { userUuid: 'emp-2', userName: 'Harshita', role: 'backup1' },
    chain: [
      { role: 'primary', userUuid: 'emp-1', userName: 'Maahi', configured: true, available: false },
      { role: 'backup1', userUuid: 'emp-2', userName: 'Harshita', configured: true, available: true },
      { role: 'backup2', userUuid: 'emp-3', userName: 'Asha', configured: true, available: true },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url === '/api/sop/tasks') return Promise.resolve({ data: { result: [] } });
    if (url === '/api/usergroup/GetUsergroupList') return Promise.resolve({
      data: { result: [{ User_group: 'Office Design' }] },
    });
    if (url === '/api/sop/handovers') return Promise.reject({ response: { status: 403 } });
    return Promise.resolve({ data: { result: [] } });
  });
  responsibilities.mockResolvedValue({ data: { result: [designResponsibility] } });
  api.post.mockResolvedValue({ data: { success: true } });
});

describe('SOP Responsibility assignment UI', () => {
  it('shows Responsibility dropdown, configured Primary/Backups and effective owner', async () => {
    render(<SopPage />);
    await screen.findByText('No SOP tasks found.');
    fireEvent.click(screen.getByRole('button', { name: 'Add Task' }));

    const dialog = screen.getByRole('dialog', { name: 'Add SOP Task' });
    const select = within(dialog).getAllByRole('combobox')[3];
    fireEvent.mouseDown(select);
    const option = await screen.findByRole('option', { name: /Customer Design Proof/ });
    expect(option).toHaveTextContent('Harshita');
    fireEvent.click(option);

    expect(await screen.findByText('Primary: Maahi')).toBeInTheDocument();
    expect(screen.getByText('Backup 1: Harshita')).toBeInTheDocument();
    expect(screen.getByText('Backup 2: Asha')).toBeInTheDocument();
    expect(screen.getByText('Effective owner now: Harshita · Backup 1')).toBeInTheDocument();
    expect(within(dialog).queryByText('Primary Group *')).not.toBeInTheDocument();
  });

  it('saves Responsibility mode without duplicate group/fallback assignment', async () => {
    render(<SopPage />);
    await screen.findByText('No SOP tasks found.');
    fireEvent.click(screen.getByRole('button', { name: 'Add Task' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title *' }), {
      target: { value: 'Send customer proof' },
    });
    const dialog = screen.getByRole('dialog', { name: 'Add SOP Task' });
    fireEvent.mouseDown(within(dialog).getAllByRole('combobox')[3]);
    fireEvent.click(await screen.findByRole('option', { name: /Customer Design Proof/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sop/tasks',
      expect.objectContaining({
        title: 'Send customer proof',
        responsibility_uuid: 'resp-design',
        primaryGroup: '',
        fallbackGroups: [],
      })));
  });
});
