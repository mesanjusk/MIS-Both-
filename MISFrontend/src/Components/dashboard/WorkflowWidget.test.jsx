// Who can see the production pipeline on the Workflow board.
//
// The board used to show every pending order to admins and only the signed-in
// user's own orders to everyone else. A print operator therefore opened the
// board and found Print showing just their own jobs, and Bind-Pack and Ready
// reading "Nothing here." — the shop floor was invisible to the people
// working it. `isAdmin` is also a substring test that is false for "Owner",
// so the owner was given the personal view too.

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import WorkflowWidget from './WorkflowWidget';
import { AuthProvider } from '../../context/AuthContext';

const TASKS = [
  { orderId: '1', orderNumber: 101, customerName: 'Alice Traders', stage: 'print', task: 'Print', assignedTo: 'Rajesh Kumar' },
  { orderId: '2', orderNumber: 102, customerName: 'Bharat Stores', stage: 'print', task: 'Print', assignedTo: 'Deepak Print' },
  { orderId: '3', orderNumber: 103, customerName: 'Chetan and Co', stage: 'bind_packing', task: 'Bind & Packing', assignedTo: 'Rajesh Kumar' },
  { orderId: '4', orderNumber: 104, customerName: 'Deccan Mills', stage: 'ready', task: 'Ready', assignedTo: 'Priya Sharma' },
];

vi.mock('../../services/orderService', () => ({
  fetchPendingTasksOverview: vi.fn(() => Promise.resolve({
    data: { success: true, tasks: TASKS, unassignedCount: 0, byUser: [] },
  })),
  assignOrderToUser: vi.fn(),
  moveOrderStage: vi.fn(),
}));
vi.mock('../../services/assigneeService', () => ({
  fetchAssignees: vi.fn(() => Promise.resolve({ data: { result: [] } })),
}));
// Heavy children that are not what this file is about.
vi.mock('../../Pages/userTask', () => ({ default: () => null }));
vi.mock('./DesignFilesWidget', () => ({ default: () => null }));
vi.mock('../../apiClient', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })) },
  getApiBase: () => '',
}));

function signIn(userName, userGroup) {
  localStorage.setItem('mis_userName', userName);
  localStorage.setItem('User_name', userName);
  localStorage.setItem('mis_userGroup', userGroup);
  localStorage.setItem('User_group', userGroup);
  localStorage.setItem('mis_token', 'a-token');
}

const renderBoard = () =>
  render(
    <AuthProvider>
      <MemoryRouter>
        <WorkflowWidget />
      </MemoryRouter>
    </AuthProvider>
  );

/** Order numbers rendered as cards on the board. */
const visibleOrders = () =>
  [101, 102, 103, 104].filter((n) => screen.queryByText(`#${n}`) !== null);

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('the whole pipeline is visible to every role', () => {
  test.each([
    ['an ordinary office user', 'Office User'],
    ['a designer', 'Designer'],
    ['office staff', 'OfficeStaff'],
    ['an accounts user', 'Accounts'],
    ['an office admin', 'Office Admin'],
    ['the owner', 'Owner'],
    ['an admin', 'Admin User'],
  ])('%s sees every stage, not just their own work', async (_label, group) => {
    signIn('Deepak Print', group);
    renderBoard();
    await waitFor(() => expect(visibleOrders()).toHaveLength(4));
  });

  test('the print operator sees print jobs assigned to other people', async () => {
    // #101 belongs to Rajesh. Before, Deepak could not see it.
    signIn('Deepak Print', 'Office User');
    renderBoard();
    await waitFor(() => expect(screen.getByText('#101')).toBeInTheDocument());
    expect(screen.getByText('Alice Traders')).toBeInTheDocument();
  });

  test('Bind-Pack and Ready are populated, not empty', async () => {
    // These two read "Nothing here." for every non-admin.
    signIn('Deepak Print', 'Office User');
    renderBoard();
    await waitFor(() => expect(screen.getByText('#103')).toBeInTheDocument());
    expect(screen.getByText('#104')).toBeInTheDocument();
  });

  test('the owner is not given the personal view', async () => {
    // `isAdmin` is normalizeRole(v).includes('admin'), which is false for
    // "Owner" — so the owner used to get the same cut-down board as staff.
    signIn('Sanju', 'Owner');
    renderBoard();
    await waitFor(() => expect(visibleOrders()).toHaveLength(4));
  });
});

describe('the personal view is still reachable', () => {
  test('an "Only mine" switch is offered on the board', async () => {
    signIn('Deepak Print', 'Office User');
    renderBoard();
    await waitFor(() => expect(screen.getByLabelText(/only mine/i)).toBeInTheDocument());
  });

  test('it is off by default, so the board opens on the whole pipeline', async () => {
    signIn('Deepak Print', 'Office User');
    renderBoard();
    await waitFor(() => expect(screen.getByLabelText(/only mine/i)).not.toBeChecked());
  });
});

describe('the action queues stay Admin/Owner only', () => {
  test.each(['Office User', 'Office Admin', 'Accounts', 'Designer'])(
    '%s is not offered the Needs Action view',
    async (group) => {
      signIn('Someone', group);
      renderBoard();
      await waitFor(() => expect(screen.getByRole('button', { name: /board/i })).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /needs action/i })).toBeNull();
    }
  );

  test.each(['Admin User', 'Owner'])('%s is offered it', async (group) => {
    signIn('Sanju', group);
    renderBoard();
    await waitFor(() => expect(screen.getByRole('button', { name: /needs action/i })).toBeInTheDocument());
  });
});
