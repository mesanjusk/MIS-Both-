const {
  collectEmployees,
  employeeWise,
  extraChargesTotal,
  itemWise,
  orderWise,
  performanceByPeriod,
  profitByPeriod,
  summarize,
  toOrderFact,
  vendorWise,
} = require('../../src/services/businessReportsService');
const { buildPoIndex } = require('../../src/utils/vendorMapping');
const { DEFAULT_UTC_OFFSET_MINUTES } = require('../../src/utils/reportPeriods');

const IST = DEFAULT_UTC_OFFSET_MINUTES;

/** A raw order document, with only what a test cares about spelled out. */
function order(overrides = {}) {
  return {
    Order_uuid: 'o1',
    Order_Number: 101,
    Customer_uuid: 'c1',
    stage: 'delivered',
    billStatus: 'paid',
    createdAt: new Date('2026-08-22T06:00:00Z'),
    Items: [{ Item: 'Wedding card', Item_uuid: 'i1', Quantity: 100, Rate: 30, Amount: 3000 }],
    Steps: [],
    vendorAssignments: [],
    workflowSteps: [],
    workRows: [],
    Status: [],
    extraCharges: [],
    ...overrides,
  };
}

const factOf = (doc, pos = []) => toOrderFact(doc, buildPoIndex(pos), IST);

describe('order facts', () => {
  it('counts invoice-level extra charges as revenue', () => {
    const doc = order({ extraCharges: [{ label: 'Freight', amount: 250 }, { label: 'Packing', amount: 50 }] });
    expect(extraChargesTotal(doc)).toBe(300);
    expect(factOf(doc).revenue).toBe(3300);
    // Only the line items feed the item-wise split, not the freight.
    expect(factOf(doc).itemsRevenue).toBe(3000);
  });

  it('takes cost from every vendor source at once', () => {
    const doc = order({
      Steps: [{ label: 'Print', vendorId: 'v1', vendorName: 'Sharma Press', costAmount: 800 }],
      vendorAssignments: [{ vendorUuid: 'v2', vendorName: 'Binding Co', amount: 200 }],
    });
    const pos = [{ Order_uuid: 'o1', Vendor_uuid: 'v3', Vendor_name: 'Foil Works', totalAmount: 500, PO_Number: 7 }];

    const fact = factOf(doc, pos);
    expect(fact.cost).toBe(1500);
    expect(fact.profit).toBe(1500);
    expect(fact.mapped).toBe(true);
  });

  it('reports an order with no vendor as unmapped, not as pure profit', () => {
    const fact = factOf(order());
    expect(fact.mapped).toBe(false);
    expect(fact.cost).toBe(0);
    // The profit figure is still revenue-minus-nothing; `mapped: false` is
    // what tells the reader that zero is a gap and not a fact.
    expect(fact.profit).toBe(3000);
  });

  it('ignores a cancelled purchase order', () => {
    const pos = [{ Order_uuid: 'o1', Vendor_uuid: 'v1', Vendor_name: 'X', totalAmount: 900, status: 'cancelled' }];
    expect(factOf(order(), pos).cost).toBe(0);
  });
});

describe('collectEmployees', () => {
  it('reads all three places an assignment is recorded, once each', () => {
    const doc = order({
      Status: [{ Assigned: 'Priya', AssignedType: 'user' }, { Assigned: 'Priya', AssignedType: 'user' }],
      workflowSteps: [{ assignedTo: 'Rahul' }],
      workRows: [{ assignedUserName: 'Priya' }],
    });
    expect(collectEmployees(doc)).toEqual(['Priya', 'Rahul']);
  });

  it('does not count a vendor assignment as an employee', () => {
    // The same name can exist as both staff and supplier; AssignedType is
    // what keeps a vendor off the employee report.
    const doc = order({
      Status: [
        { Assigned: 'Sharma Press', AssignedType: 'vendor' },
        { Assigned: 'Priya', AssignedType: 'user' },
      ],
    });
    expect(collectEmployees(doc)).toEqual(['Priya']);
  });

  it('treats a Status row with no type as an employee', () => {
    // AssignedType was added later; rows written before it default to 'user'.
    expect(collectEmployees(order({ Status: [{ Assigned: 'Old Hand' }] }))).toEqual(['Old Hand']);
  });
});

describe('summarize', () => {
  it('subtracts cost from revenue and counts orders', () => {
    const facts = [
      factOf(order({ Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 1000 }] })),
      factOf(order({ Order_uuid: 'o2', Order_Number: 102, Items: [{ Item: 'Box', Quantity: 10, Rate: 50, Amount: 500 }] })),
    ];
    const totals = summarize(facts);
    expect(totals.revenue).toBe(3500);
    expect(totals.cost).toBe(1000);
    expect(totals.profit).toBe(2500);
    expect(totals.orders).toBe(2);
    expect(totals.quantity).toBe(110);
  });

  it('leaves the margin undefined when nothing was sold', () => {
    expect(summarize([]).margin).toBeNull();
    const free = factOf(order({ Items: [{ Item: 'Sample', Quantity: 1, Rate: 0, Amount: 0 }], Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 400 }] }));
    expect(summarize([free]).margin).toBeNull();
  });

  it('reports a loss as a negative profit', () => {
    const loss = factOf(order({ Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 4000 }] }));
    expect(summarize([loss]).profit).toBe(-1000);
    expect(summarize([loss]).margin).toBeCloseTo(-1 / 3);
  });

  it('counts mapped and unmapped orders separately', () => {
    const totals = summarize([
      factOf(order({ Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 10 }] })),
      factOf(order({ Order_uuid: 'o2' })),
    ]);
    expect(totals.mappedOrders).toBe(1);
    expect(totals.unmappedOrders).toBe(1);
  });
});

describe('itemWise', () => {
  it('totals an item across the orders it appears in', () => {
    const facts = [
      factOf(order()),
      factOf(order({ Order_uuid: 'o2', Order_Number: 102 })),
    ];
    const rows = itemWise(facts);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Wedding card');
    expect(rows[0].revenue).toBe(6000);
    expect(rows[0].orders).toBe(2);
    expect(rows[0].quantity).toBe(200);
  });

  it("apportions the order's vendor cost across its items by revenue share", () => {
    // One 3000 cost against a 3000/1000 split of revenue: 2250 and 750.
    const doc = order({
      Items: [
        { Item: 'Card', Item_uuid: 'i1', Quantity: 1, Rate: 3000, Amount: 3000 },
        { Item: 'Box', Item_uuid: 'i2', Quantity: 1, Rate: 1000, Amount: 1000 },
      ],
      Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 3000 }],
    });
    const rows = itemWise([factOf(doc)]);
    expect(rows.find((r) => r.label === 'Card').cost).toBeCloseTo(2250);
    expect(rows.find((r) => r.label === 'Box').cost).toBeCloseTo(750);
    // The allocation is signposted — an item margin derived this way is a
    // guide, not a costing.
    expect(rows.every((r) => r.costIsAllocated)).toBe(true);
  });

  it('keeps the apportioned costs summing to the real cost', () => {
    const doc = order({
      Items: [
        { Item: 'A', Item_uuid: 'a', Quantity: 1, Rate: 1, Amount: 1 },
        { Item: 'B', Item_uuid: 'b', Quantity: 1, Rate: 1, Amount: 1 },
        { Item: 'C', Item_uuid: 'c', Quantity: 1, Rate: 1, Amount: 1 },
      ],
      Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 100 }],
    });
    const rows = itemWise([factOf(doc)]);
    expect(rows.reduce((s, r) => s + r.cost, 0)).toBeCloseTo(100);
  });

  it('reports each row share of total revenue', () => {
    const doc = order({
      Items: [
        { Item: 'Card', Item_uuid: 'i1', Quantity: 1, Rate: 3000, Amount: 3000 },
        { Item: 'Box', Item_uuid: 'i2', Quantity: 1, Rate: 1000, Amount: 1000 },
      ],
    });
    const rows = itemWise([factOf(doc)]);
    expect(rows.reduce((s, r) => s + r.revenueShare, 0)).toBeCloseTo(1);
  });
});

describe('orderWise', () => {
  it('names the vendors behind each order', () => {
    const doc = order({
      Steps: [{ vendorId: 'v1', vendorName: 'Sharma Press', costAmount: 800 }],
      vendorAssignments: [{ vendorUuid: 'v2', vendorName: 'Binding Co', amount: 200 }],
    });
    const [row] = orderWise([factOf(doc)]);
    expect(row.label).toBe('#101');
    expect(row.vendors).toEqual(['Sharma Press', 'Binding Co']);
    expect(row.profit).toBe(2000);
    expect(row.mapped).toBe(true);
  });
});

describe('vendorWise', () => {
  it('splits one order revenue between its vendors by their share of cost', () => {
    // 3000 revenue, costs 800 and 200 — so 80/20 of the revenue.
    const doc = order({
      Steps: [{ vendorId: 'v1', vendorName: 'Sharma Press', costAmount: 800 }],
      vendorAssignments: [{ vendorUuid: 'v2', vendorName: 'Binding Co', amount: 200 }],
    });
    const rows = vendorWise([factOf(doc)]);
    const sharma = rows.find((r) => r.label === 'Sharma Press');
    const binding = rows.find((r) => r.label === 'Binding Co');

    expect(sharma.cost).toBe(800);
    expect(sharma.revenue).toBeCloseTo(2400);
    expect(binding.revenue).toBeCloseTo(600);
    // The split must not invent revenue.
    expect(sharma.revenue + binding.revenue).toBeCloseTo(3000);
  });

  it('splits evenly when no vendor has been priced yet', () => {
    const doc = order({
      vendorAssignments: [
        { vendorUuid: 'v1', vendorName: 'A', amount: 0 },
        { vendorUuid: 'v2', vendorName: 'B', amount: 0 },
      ],
    });
    const rows = vendorWise([factOf(doc)]);
    expect(rows.map((r) => r.revenue)).toEqual([1500, 1500]);
  });

  it('keeps unmapped work as its own row', () => {
    const rows = vendorWise([factOf(order())]);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('No vendor');
    expect(rows[0].cost).toBe(0);
    expect(rows[0].revenue).toBe(3000);
  });

  it('merges two links to the same vendor into one row', () => {
    const doc = order({
      Steps: [
        { label: 'Print', vendorId: 'v1', vendorName: 'Sharma Press', costAmount: 500 },
        { label: 'Cut', vendorId: 'v1', vendorName: 'Sharma Press', costAmount: 300 },
      ],
    });
    const rows = vendorWise([factOf(doc)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBe(800);
    expect(rows[0].orders).toBe(1);
  });
});

describe('employeeWise', () => {
  it('shares one order between everyone who worked it', () => {
    const doc = order({
      Status: [
        { Assigned: 'Priya', AssignedType: 'user' },
        { Assigned: 'Rahul', AssignedType: 'user' },
      ],
    });
    const rows = employeeWise([factOf(doc)]);
    expect(rows.map((r) => r.revenue)).toEqual([1500, 1500]);
    // Crediting each with the whole order would double the real revenue.
    expect(rows.reduce((s, r) => s + r.revenue, 0)).toBe(3000);
  });

  it('keeps unassigned work visible', () => {
    const rows = employeeWise([factOf(order())]);
    expect(rows[0].label).toBe('Unassigned');
    expect(rows[0].revenue).toBe(3000);
  });
});

describe('profitByPeriod', () => {
  const range = {
    from: new Date('2026-08-20T18:30:00Z'), // 21 Aug 00:00 IST
    to: new Date('2026-08-23T18:30:00Z'), // 24 Aug 00:00 IST, exclusive
  };

  it('keeps empty buckets at zero rather than dropping them', () => {
    const rows = profitByPeriod([factOf(order())], range, 'daily', IST);
    expect(rows.map((r) => r.key)).toEqual(['2026-08-21', '2026-08-22', '2026-08-23']);
    expect(rows[0].revenue).toBe(0);
    expect(rows[0].margin).toBeNull();
    expect(rows[1].revenue).toBe(3000);
  });

  it('does not add a phantom bucket for the exclusive end', () => {
    const monthRange = {
      from: new Date('2026-07-31T18:30:00Z'), // 1 Aug IST
      to: new Date('2026-08-31T18:30:00Z'), // 1 Sep IST, exclusive
    };
    expect(profitByPeriod([], monthRange, 'monthly', IST).map((r) => r.key)).toEqual(['2026-08']);
  });

  it('rolls the same orders up differently per granularity', () => {
    const facts = [
      factOf(order({ createdAt: new Date('2026-08-21T06:00:00Z') })),
      factOf(order({ Order_uuid: 'o2', createdAt: new Date('2026-08-23T06:00:00Z') })),
    ];
    expect(profitByPeriod(facts, range, 'daily', IST)).toHaveLength(3);
    // 21 Aug is a Friday and 23 Aug the Sunday of the same week.
    const weekly = profitByPeriod(facts, range, 'weekly', IST);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].revenue).toBe(6000);
  });
});

describe('performanceByPeriod', () => {
  const range = {
    from: new Date('2026-08-21T18:30:00Z'),
    to: new Date('2026-08-22T18:30:00Z'),
  };

  it('joins the operational counts to the money', () => {
    const facts = [
      factOf(order({ stage: 'delivered', billStatus: 'paid', Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 1000 }] })),
      factOf(order({ Order_uuid: 'o2', stage: 'design', billStatus: 'unpaid' })),
    ];
    const [row] = performanceByPeriod(facts, range, 'daily', IST);

    expect(row.orders).toBe(2);
    expect(row.delivered).toBe(1);
    expect(row.billed).toBe(1);
    expect(row.mapped).toBe(1);
    expect(row.unmapped).toBe(1);
    expect(row.revenue).toBe(6000);
    expect(row.profit).toBe(5000);
    expect(row.deliveryRate).toBeCloseTo(0.5);
    expect(row.avgOrderValue).toBe(3000);
  });

  it('measures on-time only over orders that have a due date', () => {
    const facts = [
      // Delivered a day early.
      factOf(order({ dueDate: new Date('2026-08-23T06:00:00Z'), billPaidAt: new Date('2026-08-22T06:00:00Z') })),
      // Late.
      factOf(order({ Order_uuid: 'o2', dueDate: new Date('2026-08-21T06:00:00Z'), billPaidAt: new Date('2026-08-22T06:00:00Z') })),
      // No due date — cannot be judged either way, so it is not in the rate.
      factOf(order({ Order_uuid: 'o3' })),
    ];
    expect(performanceByPeriod(facts, range, 'daily', IST)[0].onTimeRate).toBeCloseTo(0.5);
  });

  it('leaves a rate undefined rather than dividing by zero', () => {
    const [row] = performanceByPeriod([], range, 'daily', IST);
    expect(row.deliveryRate).toBeNull();
    expect(row.onTimeRate).toBeNull();
    expect(row.mappedRate).toBeNull();
  });
});
