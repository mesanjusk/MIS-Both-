import { describe, expect, it } from 'vitest';
import {
  buildPoIndex,
  collectVendorLinks,
  poTotal,
  summarizeMapping,
} from './vendorMapping';

const order = (over = {}) => ({ Order_uuid: 'ord-1', Order_Number: 782, totalAmount: 16500, ...over });

const po = (over = {}) => ({
  PO_uuid: 'po-1',
  PO_Number: 41,
  Order_uuid: 'ord-1',
  Vendor_uuid: 'ven-1',
  Vendor_name: 'Anand Printers',
  totalAmount: 9000,
  status: 'received',
  ...over,
});

describe('buildPoIndex', () => {
  it('groups purchase orders by the order they were raised for', () => {
    const index = buildPoIndex([po(), po({ PO_uuid: 'po-2', PO_Number: 42 }), po({ PO_uuid: 'po-3', Order_uuid: 'ord-2' })]);
    expect(index.get('ord-1')).toHaveLength(2);
    expect(index.get('ord-2')).toHaveLength(1);
  });

  it('ignores purchase orders that are not linked to any order', () => {
    const index = buildPoIndex([po({ Order_uuid: '' }), po({ Order_uuid: null })]);
    expect(index.size).toBe(0);
  });
});

describe('poTotal', () => {
  it('adds extra charges to the item total', () => {
    expect(poTotal(po({ totalAmount: 9000, extraCharges: [{ label: 'Freight', amount: 500 }] }))).toBe(9500);
  });

  it('treats a missing total as zero', () => {
    expect(poTotal({})).toBe(0);
  });
});

describe('collectVendorLinks', () => {
  it('maps an order through its purchase order', () => {
    const result = collectVendorLinks(order(), buildPoIndex([po()]));
    expect(result.mapped).toBe(true);
    expect(result.vendorCost).toBe(9000);
    expect(result.vendorNames).toEqual(['Anand Printers']);
    expect(result.links[0]).toMatchObject({ source: 'po', ref: 'PO #41' });
  });

  it('ignores a cancelled purchase order', () => {
    const result = collectVendorLinks(order(), buildPoIndex([po({ status: 'cancelled' })]));
    expect(result.mapped).toBe(false);
    expect(result.vendorCost).toBe(0);
  });

  it('maps an order through a step vendor', () => {
    const result = collectVendorLinks(
      order({ Steps: [{ label: 'Printing', vendorId: 'ven-2', vendorName: 'Sai Offset', costAmount: 4000 }] }),
      new Map()
    );
    expect(result.mapped).toBe(true);
    expect(result.vendorCost).toBe(4000);
    expect(result.links[0]).toMatchObject({ source: 'step', ref: 'Printing' });
  });

  it('maps an order through a vendor assignment', () => {
    const result = collectVendorLinks(
      order({ vendorAssignments: [{ vendorCustomerUuid: 'ven-3', vendorName: 'Ravi Binding', workType: 'Binding', amount: 1200 }] }),
      new Map()
    );
    expect(result.mapped).toBe(true);
    expect(result.links[0]).toMatchObject({ source: 'assignment', ref: 'Binding' });
  });

  it('adds up every source and lists each vendor once', () => {
    const result = collectVendorLinks(
      order({
        Steps: [{ label: 'Printing', vendorId: 'ven-1', vendorName: 'Anand Printers', costAmount: 1000 }],
        vendorAssignments: [{ vendorUuid: 'ven-3', vendorName: 'Ravi Binding', amount: 500 }],
      }),
      buildPoIndex([po()])
    );
    expect(result.vendorCost).toBe(10500);
    expect(result.vendorNames).toEqual(['Anand Printers', 'Ravi Binding']);
  });

  it('reports an order with no cost side as unmapped', () => {
    const result = collectVendorLinks(order({ Steps: [{ label: 'Design', vendorId: null }] }), new Map());
    expect(result.mapped).toBe(false);
    expect(result.links).toHaveLength(0);
  });

  it('counts a vendor with no amount yet as mapped', () => {
    const result = collectVendorLinks(
      order({ Steps: [{ label: 'Printing', vendorId: 'ven-2', vendorName: 'Sai Offset' }] }),
      new Map()
    );
    expect(result.mapped).toBe(true);
    expect(result.vendorCost).toBe(0);
  });
});

describe('summarizeMapping', () => {
  it('separates the mapped orders from the ones still missing a vendor', () => {
    const orders = [
      order(),
      order({ Order_uuid: 'ord-2', Order_Number: 783, totalAmount: 2000 }),
    ];
    const summary = summarizeMapping(orders, buildPoIndex([po()]));

    expect(summary).toMatchObject({
      total: 2,
      mapped: 1,
      unmapped: 1,
      saleValue: 18500,
      vendorCost: 9000,
      margin: 9500,
    });
    expect(summary.unmappedOrders[0].Order_Number).toBe(783);
  });

  it('handles an empty day', () => {
    expect(summarizeMapping([], new Map())).toMatchObject({ total: 0, mapped: 0, unmapped: 0, margin: 0 });
  });
});
