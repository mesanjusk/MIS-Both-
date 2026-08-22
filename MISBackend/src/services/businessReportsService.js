/**
 * The arithmetic behind the admin business reports.
 *
 * Six views over one set of facts — item wise, order wise, vendor wise,
 * employee wise, profit by period and performance — so all six share a single
 * definition of revenue, cost and profit rather than each screen inventing its
 * own. The pure half (everything above `loadReportData`) takes plain objects
 * and is tested without a database.
 *
 * Where the money comes from, and why:
 *
 *   Revenue  `Items[].Amount` summed, plus invoice-level `extraCharges`.
 *            `saleSubtotal` is the same sum kept denormalised by the schema,
 *            but the item rows are needed anyway for the item-wise split, so
 *            it is recomputed here and the two are expected to agree.
 *
 *   Cost     every vendor link behind the order — see `utils/vendorMapping`.
 *            All work here is outsourced or booked to an in-house vendor
 *            account, so this is the whole cost side.
 *
 *   Profit   revenue minus cost, on the same order. Never joined from two
 *            sources, so a total can never disagree with the rows above it.
 *
 * An order with no vendor is reported as *unmapped* rather than as pure
 * profit. That distinction is the point: unmapped work is a gap in the books,
 * and a report that quietly counted it as free would flatter every margin on
 * the page.
 */

const Orders = require('../repositories/order');
const PurchaseOrder = require('../repositories/purchaseOrder');
const { buildPoIndex, collectVendorLinks } = require('../utils/vendorMapping');
const {
  endOfPeriod,
  periodKey,
  periodLabel,
  periodStarts,
  reportOffsetMinutes,
} = require('../utils/reportPeriods');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (v) => String(v ?? '').trim();

/** Beyond this many orders in one range the totals stop being exact. */
const MAX_ORDERS = 20000;

const UNASSIGNED = '__unassigned__';

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/** Invoice-level charges that belong to revenue but sit outside the line items. */
function extraChargesTotal(order) {
  return (order?.extraCharges || []).reduce((s, c) => s + num(c?.amount), 0);
}

/**
 * Who worked the order, by name.
 *
 * Assignment is recorded in three places that grew at different times, so all
 * three are read and de-duplicated. `Status[]` entries carry `AssignedType`,
 * which distinguishes an employee from a vendor — anything tagged `vendor`
 * belongs to the cost side and is skipped here, or the same person would be
 * counted as both staff and supplier.
 */
function collectEmployees(order) {
  const names = [];
  const add = (name) => {
    const value = clean(name);
    if (value && !names.includes(value)) names.push(value);
  };

  for (const entry of order?.Status || []) {
    if (clean(entry?.AssignedType) === 'vendor') continue;
    add(entry?.Assigned);
  }
  for (const step of order?.workflowSteps || []) add(step?.assignedTo);
  for (const row of order?.workRows || []) add(row?.assignedUserName);

  return names;
}

/**
 * One order flattened into the shape every report reads.
 *
 * `occurredAt` is the order's creation date. Delivery and payment dates exist
 * too, but an order belongs to the period it was *taken* in — that is the
 * question these reports answer ("what did August bring in"), and it is the
 * only one of the three dates every order has.
 */
function toOrderFact(order, poIndex, offsetMinutes) {
  const items = (order?.Items || []).map((item) => ({
    key: clean(item?.Item_uuid) || clean(item?.Item) || 'item',
    name: clean(item?.Item) || 'Unnamed item',
    group: clean(item?.Item_group),
    itemType: clean(item?.itemType) || 'finished_item',
    quantity: num(item?.Quantity),
    rate: num(item?.Rate),
    revenue: num(item?.Amount),
  }));

  const { links, vendorCost, mapped } = collectVendorLinks(order, poIndex);
  const itemsRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const revenue = itemsRevenue + extraChargesTotal(order);

  return {
    orderId: clean(order?.Order_uuid),
    orderNumber: order?.Order_Number ?? null,
    customerUuid: clean(order?.Customer_uuid),
    stage: clean(order?.stage) || 'enquiry',
    billStatus: clean(order?.billStatus) || 'unpaid',
    occurredAt: order?.createdAt ? new Date(order.createdAt) : null,
    dueDate: order?.dueDate ? new Date(order.dueDate) : null,
    billPaidAt: order?.billPaidAt ? new Date(order.billPaidAt) : null,
    periodSource: 'createdAt',
    items,
    itemsRevenue,
    revenue,
    cost: vendorCost,
    profit: revenue - vendorCost,
    mapped,
    vendorLinks: links,
    employees: collectEmployees(order),
    offsetMinutes,
  };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

function emptyTotals() {
  return { revenue: 0, cost: 0, profit: 0, margin: null, orders: 0, quantity: 0 };
}

function finishTotals(totals) {
  totals.profit = totals.revenue - totals.cost;
  // A margin on zero revenue is not 0%, it is undefined — printing "0%" next
  // to a period that sold nothing invites the wrong conclusion.
  totals.margin = totals.revenue === 0 ? null : totals.profit / totals.revenue;
  return totals;
}

function summarize(facts) {
  const totals = emptyTotals();
  let mapped = 0;
  for (const fact of facts) {
    totals.revenue += fact.revenue;
    totals.cost += fact.cost;
    totals.orders += 1;
    totals.quantity += fact.items.reduce((s, i) => s + i.quantity, 0);
    if (fact.mapped) mapped += 1;
  }
  finishTotals(totals);
  totals.mappedOrders = mapped;
  totals.unmappedOrders = facts.length - mapped;
  return totals;
}

/**
 * Rows sorted by revenue, descending, with the label as tie-break so two rows
 * that earned the same amount do not swap places between two loads.
 */
function sortRows(rows, grandRevenue) {
  for (const row of rows) {
    finishTotals(row);
    row.revenueShare = grandRevenue === 0 ? 0 : row.revenue / grandRevenue;
  }
  rows.sort((a, b) => b.revenue - a.revenue || String(a.label).localeCompare(String(b.label)));
  return rows;
}

function bucketFor(map, key, label, detail) {
  let row = map.get(key);
  if (!row) {
    row = { key, label, detail, ...emptyTotals() };
    map.set(key, row);
  }
  return row;
}

// ---------------------------------------------------------------------------
// The five "…wise" groupings
// ---------------------------------------------------------------------------

/**
 * Item wise: what sells, and what is left after the work behind it.
 *
 * An order's cost is a single vendor bill for the whole job, not a per-line
 * figure, so it is apportioned across the order's items by their share of that
 * order's revenue. That is an allocation, not a measurement — `costIsAllocated`
 * says so on every row, because an item-level margin derived this way is a
 * guide to which items carry their weight, not a costing.
 */
function itemWise(facts) {
  const rows = new Map();

  for (const fact of facts) {
    for (const item of fact.items) {
      const row = bucketFor(rows, `${item.itemType}:${item.key}`, item.name, item.group || item.itemType);
      const share = fact.itemsRevenue === 0 ? 0 : item.revenue / fact.itemsRevenue;
      row.revenue += item.revenue;
      row.cost += fact.cost * share;
      row.quantity += item.quantity;
      row.orders += 1;
    }
  }

  const grand = [...rows.values()].reduce((s, r) => s + r.revenue, 0);
  return sortRows([...rows.values()], grand).map((row) => ({ ...row, costIsAllocated: true }));
}

/** Order wise: one row per order, with the vendors behind it named. */
function orderWise(facts) {
  const grand = facts.reduce((s, f) => s + f.revenue, 0);
  const rows = facts.map((fact) => ({
    key: fact.orderId,
    label: fact.orderNumber != null ? `#${fact.orderNumber}` : fact.orderId.slice(0, 8),
    detail: fact.stage,
    revenue: fact.revenue,
    cost: fact.cost,
    profit: fact.profit,
    margin: null,
    orders: 1,
    quantity: fact.items.reduce((s, i) => s + i.quantity, 0),
    billStatus: fact.billStatus,
    mapped: fact.mapped,
    vendors: [...new Set(fact.vendorLinks.map((l) => l.vendorName))],
    occurredAt: fact.occurredAt,
  }));
  return sortRows(rows, grand);
}

/**
 * Vendor wise: what each supplier was paid, and what the work they did earned.
 *
 * A vendor's "revenue" is the revenue of the orders they worked, apportioned
 * by their share of that order's cost when several vendors worked it. An
 * order with two vendors is not two whole orders' worth of revenue.
 */
function vendorWise(facts) {
  const rows = new Map();

  for (const fact of facts) {
    if (fact.vendorLinks.length === 0) {
      const row = bucketFor(rows, UNASSIGNED, 'No vendor', 'unmapped');
      row.revenue += fact.revenue;
      row.orders += 1;
      continue;
    }

    const totalLinked = fact.vendorLinks.reduce((s, l) => s + l.amount, 0);
    const perVendor = new Map();
    for (const link of fact.vendorLinks) {
      const key = link.vendorUuid || `name:${link.vendorName}`;
      const entry = perVendor.get(key) || { name: link.vendorName, amount: 0 };
      entry.amount += link.amount;
      perVendor.set(key, entry);
    }

    for (const [key, entry] of perVendor) {
      const row = bucketFor(rows, key, entry.name, 'vendor');
      // Split evenly when nothing is priced yet, so an assigned-but-unpriced
      // vendor still shows the work it is carrying.
      const share = totalLinked === 0 ? 1 / perVendor.size : entry.amount / totalLinked;
      row.cost += entry.amount;
      row.revenue += fact.revenue * share;
      row.orders += 1;
    }
  }

  const grand = [...rows.values()].reduce((s, r) => s + r.revenue, 0);
  return sortRows([...rows.values()], grand);
}

/**
 * Employee wise: what each person's orders were worth.
 *
 * An order worked by three people counts once for each of them, at a third of
 * its value — crediting each with the whole order would make the column sum to
 * several times the real revenue.
 */
function employeeWise(facts) {
  const rows = new Map();

  for (const fact of facts) {
    const names = fact.employees.length > 0 ? fact.employees : [null];
    const share = 1 / names.length;

    for (const name of names) {
      const row = bucketFor(rows, name || UNASSIGNED, name || 'Unassigned', name ? 'staff' : 'unassigned');
      row.revenue += fact.revenue * share;
      row.cost += fact.cost * share;
      row.quantity += fact.items.reduce((s, i) => s + i.quantity, 0) * share;
      row.orders += 1;
    }
  }

  const grand = [...rows.values()].reduce((s, r) => s + r.revenue, 0);
  return sortRows([...rows.values()], grand).map((row) => ({ ...row, isShared: true }));
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** Profit by day, week or month. Empty buckets stay in, at zero. */
function profitByPeriod(facts, range, granularity, offsetMinutes = reportOffsetMinutes()) {
  const byKey = new Map();
  for (const fact of facts) {
    if (!fact.occurredAt) continue;
    const key = periodKey(fact.occurredAt, granularity, offsetMinutes);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(fact);
  }

  // `to` is exclusive, so the last bucket is the one the instant before it
  // falls in — otherwise a range ending on a month boundary grows a phantom
  // empty month on the end.
  const lastInstant = new Date(Math.max(range.from.getTime(), range.to.getTime() - 1));

  return periodStarts(range.from, lastInstant, granularity, offsetMinutes).map((start) => {
    const key = periodKey(start, granularity, offsetMinutes);
    return {
      key,
      label: periodLabel(start, granularity, offsetMinutes),
      start,
      end: endOfPeriod(start, granularity, offsetMinutes),
      ...summarize(byKey.get(key) || []),
    };
  });
}

/**
 * Performance: how the work went, per period, next to what it earned.
 *
 * Money alone cannot say whether a good month came from doing more work or
 * charging more for the same work. One row carrying both is the point.
 */
function performanceByPeriod(facts, range, granularity, offsetMinutes = reportOffsetMinutes()) {
  const byKey = new Map();
  for (const fact of facts) {
    if (!fact.occurredAt) continue;
    const key = periodKey(fact.occurredAt, granularity, offsetMinutes);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(fact);
  }

  const lastInstant = new Date(Math.max(range.from.getTime(), range.to.getTime() - 1));

  return periodStarts(range.from, lastInstant, granularity, offsetMinutes).map((start) => {
    const key = periodKey(start, granularity, offsetMinutes);
    const bucket = byKey.get(key) || [];
    const totals = summarize(bucket);

    const delivered = bucket.filter((f) => f.stage === 'delivered').length;
    const billed = bucket.filter((f) => f.billStatus === 'paid').length;
    // Only an order with a due date can be judged late, so the rate is over
    // those, not over every order.
    const datedAndDelivered = bucket.filter((f) => f.dueDate && f.billPaidAt);
    const onTime = datedAndDelivered.filter((f) => f.billPaidAt <= f.dueDate).length;

    return {
      key,
      label: periodLabel(start, granularity, offsetMinutes),
      start,
      orders: bucket.length,
      delivered,
      billed,
      mapped: totals.mappedOrders,
      unmapped: totals.unmappedOrders,
      revenue: totals.revenue,
      cost: totals.cost,
      profit: totals.profit,
      margin: totals.margin,
      avgOrderValue: bucket.length === 0 ? 0 : totals.revenue / bucket.length,
      deliveryRate: bucket.length === 0 ? null : delivered / bucket.length,
      mappedRate: bucket.length === 0 ? null : totals.mappedOrders / bucket.length,
      onTimeRate: datedAndDelivered.length === 0 ? null : onTime / datedAndDelivered.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Every order created in the range, flattened, with its purchase orders.
 *
 * Aggregation happens in memory rather than in a `$group` pipeline: revenue is
 * `Quantity × Rate` summed across a nested array and cost comes from three
 * different shapes, so a pipeline would need to duplicate the mapping rule in
 * Mongo's language and the two would drift. A studio's orders run to thousands
 * a year, so the volume is not the constraint; `MAX_ORDERS` is the backstop
 * for the day that stops being true.
 */
async function loadReportData(range, offsetMinutes = reportOffsetMinutes()) {
  const orders = await Orders.find({
    createdAt: { $gte: range.from, $lt: range.to },
    isTemporary: { $ne: true },
  })
    .select(
      'Order_uuid Order_Number Customer_uuid stage billStatus billPaidAt dueDate createdAt ' +
        'Items extraCharges Steps vendorAssignments workflowSteps workRows Status'
    )
    .limit(MAX_ORDERS + 1)
    .lean();

  const truncated = orders.length > MAX_ORDERS;
  const kept = truncated ? orders.slice(0, MAX_ORDERS) : orders;

  const orderUuids = kept.map((o) => o.Order_uuid).filter(Boolean);
  const purchaseOrders = orderUuids.length
    ? await PurchaseOrder.find({ Order_uuid: { $in: orderUuids } })
        .select('Order_uuid Vendor_uuid Vendor_name PO_Number totalAmount extraCharges status')
        .lean()
    : [];

  const poIndex = buildPoIndex(purchaseOrders);
  return {
    facts: kept.map((order) => toOrderFact(order, poIndex, offsetMinutes)),
    truncated,
  };
}

module.exports = {
  MAX_ORDERS,
  UNASSIGNED,
  extraChargesTotal,
  collectEmployees,
  toOrderFact,
  summarize,
  itemWise,
  orderWise,
  vendorWise,
  employeeWise,
  profitByPeriod,
  performanceByPeriod,
  loadReportData,
};
