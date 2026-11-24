import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TeamFollowupHome from './TeamFollowupHome';

const auth = vi.hoisted(() => ({ userGroup: 'Admin User', permissions: {} }));
const calls = vi.hoisted(() => ({ team: vi.fn(), warnings: vi.fn(), office: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/operationsService', () => ({
  fetchTeamStatus: calls.team,
  fetchConfigurationWarnings: calls.warnings,
}));
vi.mock('../Components/OfficeAiPanel', () => ({ default: () => { calls.office(); return <div>Office AI content</div>; } }));
vi.mock('../Components/CustomerAiPanel', () => ({ default: () => <div>Customer AI content</div> }));
vi.mock('./MyOperations', () => ({ default: () => <div>Personal task content</div> }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.userGroup = 'Admin User';
  auth.permissions = {};
  calls.team.mockResolvedValue({ data: { result: { rows: [], responsibilities: [], escalated: [], unownedTasks: [] } } });
  calls.warnings.mockResolvedValue({ data: { result: [] } });
});

describe('Team Follow-up sub-tabs', () => {
  it('opens only the overview and defers AI and configuration requests', async () => {
    render(<MemoryRouter><TeamFollowupHome /></MemoryRouter>);
    expect(await screen.findByText('Employee workload')).toBeInTheDocument();
    expect(calls.team).toHaveBeenCalled();
    expect(calls.warnings).not.toHaveBeenCalled();
    expect(calls.office).not.toHaveBeenCalled();
    expect(screen.queryByText('Responsibility Coverage')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Office AI' }));
    expect(await screen.findByText('Office AI content')).toBeInTheDocument();
    expect(screen.queryByText('Employee workload')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Escalations' }));
    expect(await screen.findByText('Overdue assigned tasks')).toBeInTheDocument();
    expect(calls.warnings).toHaveBeenCalled();
    expect(screen.queryByText('Office AI content')).not.toBeInTheDocument();
  });

  it('limits staff to personal tasks', async () => {
    auth.userGroup = 'Office Admin';
    render(<MemoryRouter><TeamFollowupHome /></MemoryRouter>);
    expect(await screen.findByText('Personal task content')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
    expect(calls.team).not.toHaveBeenCalled();
  });
});
