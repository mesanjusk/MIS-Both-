const fs = require('fs');
const path = require('path');

const { buildPoIndex, collectVendorLinks, poTotal } = require('../../src/utils/vendorMapping');

/**
 * These cases mirror the frontend suite for `MISFrontend/src/utils/vendorMapping.js`.
 * The two modules are deliberate twins — the backend cannot require an ES
 * module, and the admin reports aggregate server-side — so the rule is written
 * twice and has to be verified twice. Change one, change the other.
 */
describe('collectVendorLinks', () => {
  const base = { Order_uuid: 'o1', Steps: [], vendorAssignments: [] };

  it('reads a linked purchase order', () => {
    const pos = [{ Order_uuid: 'o1', Vendor_uuid: 'v1', Vendor_name: 'Sharma Press', totalAmount: 900, PO_Number: 12 }];
    const result = collectVendorLinks(base, buildPoIndex(pos));

    expect(result.mapped).toBe(true);
    expect(result.vendorCost).toBe(900);
    expect(result.links[0]).toMatchObject({ source: 'po', vendorUuid: 'v1', ref: 'PO #12' });
  });

  it('includes a PO extra charges in its total', () => {
    expect(poTotal({ totalAmount: 1000, extraCharges: [{ amount: 150 }, { amount: 50 }] })).toBe(1200);
  });

  it('skips a cancelled purchase order', () => {
    const pos = [{ Order_uuid: 'o1', Vendor_uuid: 'v1', totalAmount: 900, status: 'cancelled' }];
    expect(collectVendorLinks(base, buildPoIndex(pos)).mapped).toBe(false);
  });

  it('reads a step vendor', () => {
    const order = { ...base, Steps: [{ label: 'Print', vendorId: 'v2', vendorName: 'Ink Co', costAmount: 400 }] };
    expect(collectVendorLinks(order).vendorCost).toBe(400);
    expect(collectVendorLinks(order).links[0]).toMatchObject({ source: 'step', ref: 'Print' });
  });

  it('ignores a step with no vendor at all', () => {
    const order = { ...base, Steps: [{ label: 'Check', costAmount: 0 }] };
    expect(collectVendorLinks(order).mapped).toBe(false);
  });

  it('counts a vendor named with no amount as mapped', () => {
    // It is assigned work, just not priced yet — that is a different state
    // from having no vendor, and the report should say so.
    const order = { ...base, vendorAssignments: [{ vendorUuid: 'v3', vendorName: 'Foil Works', amount: 0 }] };
    const result = collectVendorLinks(order);
    expect(result.mapped).toBe(true);
    expect(result.vendorCost).toBe(0);
  });

  it('falls back to the legacy vendorCustomerUuid field', () => {
    const order = { ...base, vendorAssignments: [{ vendorCustomerUuid: 'v4', vendorName: 'Old Link', amount: 100 }] };
    expect(collectVendorLinks(order).links[0].vendorUuid).toBe('v4');
  });

  it('adds up all three sources on one order', () => {
    const order = {
      ...base,
      Steps: [{ vendorId: 'v1', vendorName: 'A', costAmount: 100 }],
      vendorAssignments: [{ vendorUuid: 'v2', vendorName: 'B', amount: 200 }],
    };
    const pos = [{ Order_uuid: 'o1', Vendor_uuid: 'v3', Vendor_name: 'C', totalAmount: 300 }];

    const result = collectVendorLinks(order, buildPoIndex(pos));
    expect(result.vendorCost).toBe(600);
    expect(result.vendorNames).toEqual(['C', 'A', 'B']);
  });

  it('lists each vendor name once', () => {
    const order = {
      ...base,
      Steps: [
        { vendorId: 'v1', vendorName: 'A', costAmount: 100 },
        { vendorId: 'v1', vendorName: 'A', costAmount: 50 },
      ],
    };
    expect(collectVendorLinks(order).vendorNames).toEqual(['A']);
  });

  it('treats an order with nothing attached as unmapped', () => {
    expect(collectVendorLinks(base).mapped).toBe(false);
    expect(collectVendorLinks({}).mapped).toBe(false);
  });
});

describe('the frontend twin', () => {
  it('still exists where this module says it does', () => {
    // A rename or delete on the other side should fail here rather than leave
    // the comment in vendorMapping.js pointing at nothing.
    const twin = path.join(__dirname, '../../../MISFrontend/src/utils/vendorMapping.js');
    expect(fs.existsSync(twin)).toBe(true);

    // Both must agree on the source names, which are what a report groups by.
    const source = fs.readFileSync(twin, 'utf8');
    for (const key of ["PO: 'po'", "STEP: 'step'", "ASSIGNMENT: 'assignment'"]) {
      expect(source).toContain(key);
    }
  });
});
