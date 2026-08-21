// src/utils/vendorMapping.js
//
// Every order has two sides: the customer it is billed to and the vendor that
// did the work. Nothing here is produced in-house without a vendor account —
// own-workshop capacity is registered as a vendor too — so an order with no
// vendor behind it is an unmapped order, not a zero-cost one.
//
// The cost side can be recorded three ways, all of which count as a mapping:
//
//   • a Purchase Order linked to the order (Order_uuid)   → the normal route
//   • an order Step with a vendor and a cost              → outsourced stage
//   • a vendorAssignment row                              → job-work planning
//
// This module is the single place those are read, so the delivery report, the
// exports and anything added later agree on what "mapped" means.

export const MAPPING_SOURCES = Object.freeze({
  PO: 'po',
  STEP: 'step',
  ASSIGNMENT: 'assignment',
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (v) => String(v ?? '').trim();

/** Index purchase orders by the order they were raised for. */
export function buildPoIndex(purchaseOrders = []) {
  const index = new Map();
  for (const po of purchaseOrders) {
    const key = clean(po?.Order_uuid);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(po);
  }
  return index;
}

/** Total of a PO including its extra charges (freight, packing, …). */
export function poTotal(po) {
  const extras = (po?.extraCharges || []).reduce((s, c) => s + num(c?.amount), 0);
  return num(po?.totalAmount) + extras;
}

/**
 * Every vendor link behind one order, newest concept first (POs), then the
 * step and assignment rows that predate them.
 *
 * @returns {{links: Array, vendorCost: number, vendorNames: string[], mapped: boolean}}
 */
export function collectVendorLinks(order, poIndex = new Map()) {
  const links = [];

  for (const po of poIndex.get(clean(order?.Order_uuid)) || []) {
    if (clean(po.status) === 'cancelled') continue;
    links.push({
      source: MAPPING_SOURCES.PO,
      vendorUuid: clean(po.Vendor_uuid),
      vendorName: clean(po.Vendor_name) || 'Vendor',
      amount: poTotal(po),
      ref: po.PO_Number ? `PO #${po.PO_Number}` : 'PO',
      raw: po,
    });
  }

  for (const step of order?.Steps || []) {
    if (!clean(step?.vendorId) && !clean(step?.vendorName)) continue;
    links.push({
      source: MAPPING_SOURCES.STEP,
      vendorUuid: clean(step.vendorId),
      vendorName: clean(step.vendorName) || 'Vendor',
      amount: num(step.costAmount),
      ref: clean(step.label) || 'Step',
      raw: step,
    });
  }

  for (const row of order?.vendorAssignments || []) {
    const vendorUuid = clean(row?.vendorUuid) || clean(row?.vendorCustomerUuid);
    if (!vendorUuid && !clean(row?.vendorName)) continue;
    links.push({
      source: MAPPING_SOURCES.ASSIGNMENT,
      vendorUuid,
      vendorName: clean(row.vendorName) || 'Vendor',
      amount: num(row.amount),
      ref: clean(row.workType) || 'Job work',
      raw: row,
    });
  }

  const vendorNames = [];
  for (const link of links) {
    if (!vendorNames.includes(link.vendorName)) vendorNames.push(link.vendorName);
  }

  return {
    links,
    vendorCost: links.reduce((s, l) => s + l.amount, 0),
    vendorNames,
    mapped: links.length > 0,
  };
}

/**
 * Roll the per-order mapping up for a set of orders: how many carry a vendor,
 * what the work cost and what is left after paying for it.
 */
export function summarizeMapping(orders = [], poIndex = new Map(), saleValueOf = (o) => num(o?.totalAmount)) {
  let mapped = 0;
  let saleValue = 0;
  let vendorCost = 0;
  const unmappedOrders = [];

  for (const order of orders) {
    const { mapped: isMapped, vendorCost: cost } = collectVendorLinks(order, poIndex);
    saleValue += saleValueOf(order);
    vendorCost += cost;
    if (isMapped) mapped += 1;
    else unmappedOrders.push(order);
  }

  return {
    total: orders.length,
    mapped,
    unmapped: orders.length - mapped,
    unmappedOrders,
    saleValue,
    vendorCost,
    margin: saleValue - vendorCost,
  };
}
