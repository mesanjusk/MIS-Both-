const {
  buildOfficeSnapshot,
  buildRuleBasedBrief,
  fallbackAnswer,
} = require('../../src/services/officeAiService');

describe('officeAiService', () => {
  const businessSummary = {
    openOrders: { count: 12, rows: [] },
    unassignedOrders: { count: 2, rows: [{ Order_Number: 101, customerName: 'A' }] },
    readyNotDelivered: { count: 3, rows: [{ Order_Number: 102, customerName: 'B' }] },
    deliveredUnpaid: { count: 1, rows: [{ Order_Number: 103, customerName: 'C', outstandingAmount: 5000 }] },
    vendorPayable: { count: 2, amount: 7400, rows: [{ vendorName: 'Printer A', balance: 7400 }] },
    todayReceipts: { count: 4, amount: 9200, rows: [] },
    todayDeliveries: { count: 2, rows: [] },
    overdueTasks: { count: 4, rows: [{ Task_name: 'Follow up', deadline: '2026-08-26T10:00:00.000Z' }] },
  };

  const teamStatus = {
    rows: [
      { User_name: 'Designer', priority: 'P1', roleTitle: 'Creative', attendanceStatus: 'Present', operationalState: 'Available', pending: 2, overdue: 0 },
      { User_name: 'Logistics', priority: 'P4', roleTitle: 'Delivery', attendanceStatus: 'Absent', operationalState: 'Available', pending: 1, overdue: 0 },
    ],
  };

  test('builds a compact snapshot from existing MIS summaries', () => {
    const snapshot = buildOfficeSnapshot({
      businessSummary,
      teamStatus,
      dailyReport: { attendance: { present: 1, absent: 1 }, tasks: { pending: 4 } },
      escalations: { escalatedResponsibilities: [{ name: 'Vendor Pickup' }], escalatedTasks: [] },
    });

    expect(snapshot.business.openOrders).toBe(12);
    expect(snapshot.business.vendorPayableAmount).toBe(7400);
    expect(snapshot.attention.unassignedOrders[0].orderNumber).toBe(101);
    expect(snapshot.team[1].priority).toBe('P4');
    expect(snapshot.attention.escalatedResponsibilities).toEqual(['Vendor Pickup']);
  });

  test('rule brief surfaces no-owner, overdue and unassigned work first', () => {
    const snapshot = buildOfficeSnapshot({
      businessSummary,
      teamStatus,
      dailyReport: {},
      escalations: { escalatedResponsibilities: [{ name: 'Vendor Pickup' }], escalatedTasks: [] },
    });
    const brief = buildRuleBasedBrief(snapshot);

    expect(brief.mode).toBe('suggest');
    expect(brief.priorities[0].severity).toBe('critical');
    expect(brief.priorities.some((item) => item.title === 'Overdue tasks')).toBe(true);
    expect(brief.priorities.some((item) => item.title === 'Orders without an owner')).toBe(true);
  });

  test('fallback answers use snapshot facts and never require an AI provider', () => {
    const snapshot = buildOfficeSnapshot({ businessSummary, teamStatus, dailyReport: {}, escalations: {} });
    const answer = fallbackAnswer('what payments are pending?', snapshot);

    expect(answer).toContain('1 delivered order(s) remain unpaid');
    expect(answer).toContain('₹9,200');
    expect(answer).toContain('₹7,400');
  });
});
