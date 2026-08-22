/**
 * The cost side of an order — which vendors did the work, and for how much.
 *
 * **This is a deliberate CommonJS twin of `MISFrontend/src/utils/vendorMapping.js`.**
 * That module is the single definition the delivery report and its exports
 * read; this one exists because the backend cannot `require` an ES module and
 * the admin reports aggregate server-side, over ranges too wide to ship to a
 * browser. The rule must stay identical in both — `test/utils/vendorMapping.test.js`
 * covers the same cases the frontend suite does, so a change to one that is
 * not made to the other fails here.
 *
 * The rule itself: nothing is produced without a vendor account — own-workshop
 * capacity is registered as a vendor too (`VendorMaster.In_house`) — so an
 * order with no vendor behind it is *unmapped*, not zero-cost. Three sources
 * count, all of them:
 *
 *   • a Purchase Order linked to the order (Order_uuid)   → the normal route
 *   • an order Step with a vendor and a cost              → outsourced stage
 *   • a vendorAssignment row                              → job-work planning
 */

const MAPPING_SOURCES = Object.freeze({
  PO: 'po',
  STEP: 'step',
  ASSIGNMENT: 'assignment',
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (v) => String(v ?? '').trim();

/** Index purchase orders by the order they were raised for. */
function buildPoIndex(purchaseOrders = []) {
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
function poTotal(po) {
  const extras = (po?.extraCharges || []).reduce((s, c) => s + num(c?.amount), 0);
  return num(po?.totalAmount) + extras;
}

/**
 * Every vendor link behind one order, newest concept first (POs), then the
 * step and assignment rows that predate them.
 *
 * A vendor named with no amount still counts as mapped — it is assigned work,
 * just not priced yet.
 */
function collectVendorLinks(order, poIndex = new Map()) {
  const links = [];

  for (const po of poIndex.get(clean(order?.Order_uuid)) || []) {
    if (clean(po.status) === 'cancelled') continue;
    links.push({
      source: MAPPING_SOURCES.PO,
      vendorUuid: clean(po.Vendor_uuid),
      vendorName: clean(po.Vendor_name) || 'Vendor',
      amount: poTotal(po),
      ref: po.PO_Number ? `PO #${po.PO_Number}` : 'PO',
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

module.exports = {
  MAPPING_SOURCES,
  buildPoIndex,
  poTotal,
  collectVendorLinks,
};
