// The consolidated order/vendor action queues.
//
// These were the Business Control Center's six tabs. Five were duplicating
// something already on screen elsewhere — its Open Orders list and the
// Workflow board showed the same orders, and both moved stages — so the
// queues moved to where the work already happens and the page became this
// component.
//
// The first test is a plain import-and-render smoke test, and it earns its
// place: when this file was moved one directory deeper, every relative import
// in it broke. The whole suite stayed green because nothing imported it, and
// only the production build caught it. This is that missing coverage.

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import OrderControlPanel from './OrderControlPanel';
import { ORDER_SECTIONS, VENDOR_SECTIONS } from './orderControlSections';

const summary = {
  openOrders: { count: 2, rows: [
    { _id: 'o1', Order_Number: 101, customerName: 'Alice', stage: 'print', outstandingAmount: 500 },
    { _id: 'o2', Order_Number: 102, customerName: 'Bob', stage: 'design', outstandingAmount: 0 },
  ] },
  unassignedOrders: { count: 1, rows: [{ _id: 'o2', Order_Number: 102, customerName: 'Bob' }] },
  readyNotDelivered: { count: 1, rows: [{ _id: 'o3', Order_Number: 103, customerName: 'Cara' }] },
  deliveredUnpaid: { count: 1, rows: [{ _id: 'o4', Order_Number: 104, outstandingAmount: 900 }] },
  vendorPayable: { count: 1, amount: 2500, rows: [{ vendorUuid: 'v1', vendorName: 'PrintCo', balance: 2500, credit: 3000, debit: 500 }] },
  overdueTasks: { count: 1, rows: [{ Task_uuid: 't1', Task_name: 'Chase proof', status: 'pending' }] },
  todayReceipts: { count: 3, amount: 4200, rows: [] },
};

vi.mock('../../services/businessOpsService', () => ({
  getBusinessControlSummary: vi.fn(() => Promise.resolve({ result: summary })),
  assignVendorToOrder: vi.fn(),
  markOrderDelivered: vi.fn(),
  markOrderReady: vi.fn(),
  moveOrderStage: vi.fn(),
  payVendor: vi.fn(),
  receiveOrderPayment: vi.fn(),
}));
vi.mock('../../services/paymentService', () => ({ fetchPayments: vi.fn(() => Promise.resolve({ data: { result: [] } })) }));
vi.mock('../../services/userService', () => ({ fetchUsers: vi.fn(() => Promise.resolve({ data: { result: [] } })) }));
vi.mock('../../services/vendorService', () => ({ fetchVendorMasters: vi.fn(() => Promise.resolve([])) }));

const renderPanel = (props = {}) =>
  render(<MemoryRouter><OrderControlPanel {...props} /></MemoryRouter>);

afterEach(() => vi.clearAllMocks());

describe('the panel loads at all', () => {
  test('renders without throwing, with every import resolving', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByRole('tab', { name: /open orders/i })).toBeInTheDocument());
  });
});

describe('sections decide which queues appear', () => {
  test('the order variant shows the order queues and not vendor payable', async () => {
    renderPanel({ sections: ORDER_SECTIONS });
    await waitFor(() => expect(screen.getByRole('tab', { name: /open orders/i })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /unassigned/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ready not delivered/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /delivered unpaid/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overdue tasks/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /vendor payable/i })).toBeNull();
  });

  test('the vendor variant shows only vendor payable', async () => {
    renderPanel({ sections: VENDOR_SECTIONS });
    await waitFor(() => expect(screen.getByRole('tab', { name: /vendor payable/i })).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /open orders/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /overdue tasks/i })).toBeNull();
  });

  test('the two section sets do not overlap', () => {
    const shared = ORDER_SECTIONS.filter((section) => VENDOR_SECTIONS.includes(section));
    expect(shared).toEqual([]);
  });

  test('tab labels carry their live counts', async () => {
    renderPanel({ sections: ORDER_SECTIONS });
    await waitFor(() => expect(screen.getByRole('tab', { name: /open orders \(2\)/i })).toBeInTheDocument());
  });
});

describe('counters', () => {
  test("today's receipts is a counter, never a tab", async () => {
    // It is named in ORDER_SECTIONS so its KPI card shows, but it is not a
    // queue and must not become something you can click into.
    expect(ORDER_SECTIONS).toContain('todayReceipts');
    renderPanel({ sections: ORDER_SECTIONS });
    await waitFor(() => expect(screen.getByRole('tab', { name: /open orders/i })).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: /today receipts/i })).toBeNull();
  });

  test('the vendor variant does not show order counters', async () => {
    renderPanel({ sections: VENDOR_SECTIONS });
    await waitFor(() => expect(screen.getByRole('tab', { name: /vendor payable/i })).toBeInTheDocument());
    expect(screen.queryByText(/ready not delivered/i)).toBeNull();
  });
});

describe('embedded mode', () => {
  test('drops the page heading, since the host already has one', async () => {
    renderPanel({ sections: ORDER_SECTIONS, embedded: true });
    await waitFor(() => expect(screen.getByRole('tab', { name: /open orders/i })).toBeInTheDocument());
    expect(screen.queryByText('Business Control Center')).toBeNull();
  });

  test('keeps the heading when standalone', async () => {
    renderPanel({ sections: ORDER_SECTIONS, embedded: false });
    await waitFor(() => expect(screen.getByText('Business Control Center')).toBeInTheDocument());
  });

  test('refresh stays available either way', async () => {
    renderPanel({ sections: ORDER_SECTIONS, embedded: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument());
  });
});
