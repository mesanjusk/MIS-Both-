// Who can see the production pipeline on the Workflow board.
//
// The board used to show every pending order to admins and only the signed-in
// user's own orders to everyone else. A print operator therefore opened the
// board and found Print showing just their own jobs, and Bind-Pack and Ready
// reading "Nothing here." — the shop floor was invisible to the people
// working it. `isAdmin` is also a substring test that is false for "Owner",
// so the owner was given the personal view too.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import WorkflowWidget from './WorkflowWidget';
import { AuthProvider } from '../../context/AuthContext';
import { assignOrderToUser, fetchPendingTasksOverview, moveOrderStage } from '../../services/orderService';
import { fetchAssignees } from '../../services/assigneeService';
import { assignDesignFile, moveDesignFileOrderToPrint, scanDesignFiles } from '../../services/designFileService';
import { createOperationsTask, fetchMyOperationsTasks } from '../../services/operationsService';
import axios from '../../apiClient';

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
vi.mock('../../services/designFileService', () => ({
  scanDesignFiles: vi.fn(async () => ({ data: { files: [] } })),
  assignDesignFile: vi.fn(),
  moveDesignFileOrderToPrint: vi.fn(),
}));
vi.mock('../../services/operationsService', () => ({
  fetchTeamStatus: vi.fn(async () => ({ data: { result: { rows: [
    { User_uuid: 'staff-1', User_name: 'Priya', attendanceStatus: 'Present', pending: 3, overdue: 1, inTime: '09:30' },
  ] } } })),
  fetchOperationsUsers: vi.fn(async () => ({ data: { result: [{ User_uuid: 'staff-1', User_name: 'Priya' }] } })),
  fetchMyOperationsTasks: vi.fn(async () => ({ data: { result: {
    availability: { attendanceStatus: 'Present' }, buckets: { overdue: [{}] },
  } } })),
  createOperationsTask: vi.fn(async () => ({ data: { success: true } })),
}));
// Heavy children that are not what this file is about.
vi.mock('../../Pages/userTask', () => ({ default: () => null }));
vi.mock('./DesignFilesWidget', () => ({ default: () => null }));
vi.mock('../../Pages/HomeInbox', () => ({ default: () => <div>Inbox content</div> }));
vi.mock('../../Pages/PendingBills', () => ({ default: () => <div>Pending Bills content</div> }));
vi.mock('../../Reports/allBills', () => ({ default: () => <div>All Bills content</div> }));
vi.mock('../../apiClient', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })) },
  getApiBase: () => '',
}));

function signIn(userName, userGroup, permissions) {
  localStorage.setItem('mis_userName', userName);
  localStorage.setItem('User_name', userName);
  localStorage.setItem('mis_userGroup', userGroup);
  localStorage.setItem('User_group', userGroup);
  localStorage.setItem('mis_token', 'a-token');
  if (permissions) localStorage.setItem('mis_permissions', JSON.stringify(permissions));
}

const renderBoard = () =>
  render(
    <AuthProvider>
      <MemoryRouter>
        <WorkflowWidget />
      </MemoryRouter>
    </AuthProvider>
  );

const renderApp = () =>
  render(<AuthProvider><MemoryRouter><WorkflowWidget standalone /></MemoryRouter></AuthProvider>);

test('mobile navigation and Team views include reports, attendance, assignment and pending tasks', async () => {
  signIn('Sanju', 'Owner');
  axios.get.mockImplementationOnce(async (path) => {
    if (path.includes('/attendance/')) return { data: { flow: ['In'] } };
    return { data: {} };
  });
  renderApp();
  const nav = await screen.findByRole('navigation', { name: 'Mobile workflow navigation' });
  expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(['Home', 'Jobs', 'Account', 'Team', 'Bills']);
  fireEvent.click(within(nav).getByRole('button', { name: 'Team' }));
  expect(await screen.findByText('3 pending · 1 overdue')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Attendance' }));
  expect(await screen.findByText('In 09:30')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'My attendance today' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Assign Task' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Task name' }), { target: { value: 'Check proof' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Assign to' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Priya' }));
  fireEvent.click(screen.getByRole('button', { name: 'Assign task' }));
  await screen.findByText('Task assigned.');
  expect(createOperationsTask).toHaveBeenCalledWith(expect.objectContaining({ Usertask_name: 'Check proof', primaryUserUuid: 'staff-1' }));

  axios.get.mockResolvedValueOnce({ data: { result: [
    { Usertask_uuid: '1', Usertask_name: 'Check proof', User: 'Priya', Status: 'Pending' },
    { Usertask_uuid: '2', Usertask_name: 'Finished job', User: 'Priya', Status: 'Completed' },
  ] } });
  fireEvent.click(screen.getByRole('tab', { name: 'Pending Tasks' }));
  expect(await screen.findByText('Check proof')).toBeInTheDocument();
  expect(screen.queryByText('Finished job')).not.toBeInTheDocument();
});

test('mobile drawer exposes the Home pages and Bills opens inside the app shell', async () => {
  signIn('Sanju', 'Owner');
  renderApp();
  fireEvent.click(await screen.findByRole('button', { name: 'Workflow menu' }));
  const menu = await screen.findByRole('menu', { name: 'Workflow pages' });
  for (const name of ['Workflow', 'Team Follow-up', 'Inbox', 'Day Book', 'Attendance', 'Orders',
    'Outstanding', 'Payable', 'Rate Calculator', 'Payment Follow-up', 'Pending Bills', 'Leads', 'Activity']) {
    expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
  }
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inbox' }));
  expect(await screen.findByText('Inbox content')).toBeInTheDocument();
  const nav = await screen.findByRole('navigation', { name: 'Mobile workflow navigation' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Bills' }));
  expect(await screen.findByText('All Bills content')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pending bills' }));
  expect(await screen.findByText('Pending Bills content')).toBeInTheDocument();
});

test('the drawer follows Home permissions and staff Bills opens Pending Bills', async () => {
  signIn('Priya', 'Office User', { canViewAccounts: false, canViewWhatsapp: false, allowedWidgets: ['workflow', 'inbox'] });
  renderApp();
  fireEvent.click(await screen.findByRole('button', { name: 'Workflow menu' }));
  const menu = await screen.findByRole('menu', { name: 'Workflow pages' });
  expect(within(menu).getByRole('menuitem', { name: 'Inbox' })).toBeInTheDocument();
  for (const name of ['Day Book', 'Orders', 'Payable', 'Payment Follow-up', 'Leads']) {
    expect(within(menu).queryByRole('menuitem', { name })).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Close workflow menu' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Bills' }));
  expect(await screen.findByText('Pending Bills content')).toBeInTheDocument();
  expect(screen.queryByText('All Bills content')).not.toBeInTheDocument();
});

test('regular staff see their personal report and no management task assignment', async () => {
  signIn('Priya', 'Office User');
  renderApp();
  fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
  expect(await screen.findByText('1 pending · 1 overdue')).toBeInTheDocument();
  expect(fetchMyOperationsTasks).toHaveBeenCalled();
  expect(screen.queryByRole('tab', { name: 'Assign Task' })).not.toBeInTheDocument();
});

async function submitJobAction(button, picker, option, submit) {
  fireEvent.click(await screen.findByRole('button', { name: button, exact: true }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: picker }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
  fireEvent.click(within(dialog).getByRole('button', { name: submit, exact: true }));
}

test('mobile Design Board cards and file details use the existing Drive workflow', async () => {
  const file = { fileId: 'drive-file', fileName: 'Flyer.cdr', stageNumber: 4, orderUuid: 'order-uuid', orderNumber: 151, orderStage: 'ready_to_print' };
  const draft = { fileId: 'draft-file', fileName: 'Poster.cdr', stageNumber: 4 };
  fetchPendingTasksOverview.mockResolvedValueOnce({ data: { tasks: [
    ...TASKS, { orderId: 'mongo-id', orderNumber: 151, customerName: 'Linked order', stage: 'ready_to_print' },
  ] } });
  scanDesignFiles.mockResolvedValue({ data: { files: [file, draft] } });
  fetchAssignees.mockResolvedValueOnce({ data: { result: [
    { id: 'designer', name: 'Design Team', type: 'payable', capabilities: ['design'] },
    { id: 'printer', name: 'Print Team', type: 'payable', capabilities: ['print'] },
  ] } });
  signIn('Sanju', 'Owner');
  try {
    renderApp();
    await screen.findByRole('button', { name: '2 Ready to Print' });
    fireEvent.click(screen.getByRole('button', { name: 'Jobs', exact: true }));
    expect(screen.getByRole('button', { name: /Flyer.cdr/ })).toBeInTheDocument();
    expect(screen.queryByText('Linked order')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Home', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: '2 Ready to Print' }));
    fireEvent.click(screen.getByRole('button', { name: /Poster.cdr/ }));
    expect(screen.queryByRole('button', { name: 'Move to Print' })).not.toBeInTheDocument();
    await submitJobAction('Assign', 'Assign to', 'Design Team', 'Assign');
    expect(assignDesignFile).toHaveBeenCalledWith(draft, 'designer', 'Sanju');
    await screen.findByText('Assigned to Design Team.');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to list' }));
    fireEvent.click(screen.getByRole('button', { name: /Flyer.cdr/ }));
    await submitJobAction('Move to Print', 'Assign to', 'Print Team', 'Move');
    expect(moveDesignFileOrderToPrint).toHaveBeenCalledWith(file, 'printer');
    await screen.findByText('Moved to Print and assigned to Print Team.');
    expect(scanDesignFiles).toHaveBeenCalledWith(true);
  } finally {
    scanDesignFiles.mockResolvedValue({ data: { files: [] } });
  }
});

test('mobile job details can reassign and move production orders', async () => {
  fetchAssignees.mockResolvedValueOnce({ data: { result: [
    { id: 'printer', name: 'Print Team', type: 'payable', capabilities: ['print'] },
  ] } });
  signIn('Sanju', 'Owner');
  renderApp();
  fireEvent.click(await screen.findByRole('button', { name: '2 Print' }));
  fireEvent.click(screen.getByRole('button', { name: /Alice Traders/ }));
  await submitJobAction('Assign', 'Assign to', 'Print Team', 'Assign');
  expect(assignOrderToUser).toHaveBeenCalledWith('1', { assignedTo: 'printer', assignedToType: 'vendor', assignedBy: 'Sanju' });
  await screen.findByText('Assigned to Print Team.');
  await submitJobAction('Move stage', 'Destination stage', 'Fitting', 'Move');
  expect(moveOrderStage).toHaveBeenCalledWith('1', 'fitting');
  await screen.findByText('Moved to Fitting.');
  expect(fetchPendingTasksOverview).toHaveBeenCalledWith({ cache: false });
});

/** Order numbers rendered as cards on the board. */
const visibleOrders = () =>
  [101, 102, 103, 104].filter((n) => screen.queryByText(`#${n}`) !== null);

test('App uses live overview rows across all views and returns to the board', async () => {
  fetchPendingTasksOverview.mockResolvedValueOnce({ data: {
    tasks: [{ ...TASKS[0], stageUpdatedAt: '2026-11-25T06:00:00Z' }, ...TASKS.slice(1)],
  } });
  signIn('Deepak Print', 'Office User');
  renderBoard();
  await screen.findByText('Alice Traders');

  fireEvent.click(screen.getByRole('button', { name: 'App' }));
  const preview = await screen.findByRole('region', { name: 'Mobile workflow app' });
  fireEvent.click(within(preview).getByRole('button', { name: /^2 Print$/i }));
  expect(within(preview).getByText('#101 · Rajesh Kumar')).toBeInTheDocument();
  expect(within(preview).queryByText('Deccan Mills')).not.toBeInTheDocument();
  fireEvent.click(within(preview).getByRole('button', { name: /Alice Traders/ }));
  expect(within(preview).getByText('Assigned to')).toBeInTheDocument();
  expect(within(preview).getByText('Rajesh Kumar')).toBeInTheDocument();
  fireEvent.click(within(preview).getByRole('button', { name: 'Back to list' }));
  fireEvent.click(within(preview).getByRole('button', { name: 'Jobs' }));
  expect(within(preview).getByText('Deccan Mills')).toBeInTheDocument();
  fireEvent.click(within(preview).getByRole('button', { name: 'Workflow menu' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Activity' }));
  expect(within(preview).getByText('Recent updates')).toBeInTheDocument();
  expect(within(preview).getByText(/25 Nov 2026/)).toBeInTheDocument();
  expect(within(preview).queryByText('Deccan Mills')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Board' }));
  expect(await screen.findByText('Alice Traders')).toBeInTheDocument();
});

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
