const { v4: uuid } = require('uuid');
const Orders = require('../repositories/order');
const Items = require('../repositories/items');
const StockMovement = require('../repositories/stockMovement');
const { resolveOrderFilter } = require('../utils/orderFilter');
const logger = require('../utils/logger');

async function movementTotalsByItem(itemUuids = []) {
  if (!itemUuids.length) return new Map();
  const rows = await StockMovement.aggregate([
    { $match: { item_uuid: { $in: itemUuids } } },
    { $group: { _id: '$item_uuid', qtyIn: { $sum: '$qty_in' }, qtyOut: { $sum: '$qty_out' } } },
  ]);
  return new Map(rows.map((row) => [row._id, row]));
}

// Current qty per stock-tracked item = opening stock + all-time StockMovement
// net (qty_in - qty_out). This replaces the dead StockLedger-backed version
// of /stock/summary, which always returned empty since nothing ever wrote
// to that collection.
async function getStockSummary() {
  const items = await Items.find(
    { stockTracked: true },
    { Item_uuid: 1, Item_name: 1, unit: 1, openingStock: 1, reorderLevel: 1 }
  ).lean();
  if (!items.length) return [];

  const moved = await movementTotalsByItem(items.map((item) => item.Item_uuid).filter(Boolean));

  return items
    .map((item) => {
      const totals = moved.get(item.Item_uuid) || { qtyIn: 0, qtyOut: 0 };
      return {
        itemUuid: item.Item_uuid,
        itemName: item.Item_name,
        unit: item.unit || 'Nos',
        currentQty: Number(item.openingStock || 0) + Number(totals.qtyIn || 0) - Number(totals.qtyOut || 0),
        reorderLevel: Number(item.reorderLevel || 0),
      };
    })
    .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
}

// Bulk "how much is available right now" for a set of item uuids, limited to
// stock-tracked items (untracked items are treated by callers as always
// available — the business has opted not to track them).
async function getAvailableQtyMap(itemUuids = []) {
  const uuids = [...new Set(itemUuids.filter(Boolean))];
  if (!uuids.length) return new Map();

  const items = await Items.find(
    { Item_uuid: { $in: uuids }, stockTracked: true },
    { Item_uuid: 1, openingStock: 1 }
  ).lean();
  if (!items.length) return new Map();

  const moved = await movementTotalsByItem(items.map((item) => item.Item_uuid));
  const result = new Map();
  for (const item of items) {
    const totals = moved.get(item.Item_uuid) || { qtyIn: 0, qtyOut: 0 };
    result.set(item.Item_uuid, Number(item.openingStock || 0) + Number(totals.qtyIn || 0) - Number(totals.qtyOut || 0));
  }
  return result;
}

// The one place that both consumes a work row and records the movement, so
// the two can no longer drift the way workRows.consumedQty did before (set
// once at creation, never touched again).
// How many times a losing claim re-reads before giving up. Contention on one
// work row is rare; this is a guard against spinning, not a queue.
const CONSUME_MAX_ATTEMPTS = 5;

async function consumeWorkRow({ orderId, workRowId, qty, consumedBy = 'system' } = {}) {
  const filter = resolveOrderFilter(orderId);
  if (!filter) {
    const error = new Error('Order id is required');
    error.statusCode = 400;
    throw error;
  }

  const consumeQty = Number(qty);
  if (!Number.isFinite(consumeQty) || consumeQty <= 0) {
    const error = new Error('qty must be a positive number');
    error.statusCode = 400;
    throw error;
  }

  // Claim the quantity with a conditional update, then record the movement.
  //
  // Reading the remaining quantity and then incrementing it unconditionally let
  // two concurrent requests both pass the check and consume past what the row
  // required. The update below only matches while consumedQty is still what
  // was read, so at most one of them wins and the loser re-reads.
  let order;
  let workRow;
  let attempt = 0;

  for (;;) {
    order = await Orders.findOne(filter).lean();
    if (!order) {
      const error = new Error('Order not found');
      error.statusCode = 404;
      throw error;
    }

    workRow = (order.workRows || []).find((row) => row.workRowId === workRowId);
    if (!workRow) {
      const error = new Error('Work row not found');
      error.statusCode = 404;
      throw error;
    }

    const observedConsumed = Number(workRow.consumedQty || 0);
    const remaining = Number(workRow.requiredQty || 0) - observedConsumed;
    if (consumeQty > remaining + 1e-9) {
      const error = new Error(`Cannot consume ${consumeQty}; only ${Math.max(0, remaining)} remaining for this work row`);
      error.statusCode = 400;
      throw error;
    }

    const newConsumedQty = observedConsumed + consumeQty;
    const newStatus = newConsumedQty >= Number(workRow.requiredQty || 0) ? 'done' : 'in_progress';

    const updateResult = await Orders.updateOne(
      {
        ...filter,
        workRows: {
          $elemMatch: {
            workRowId,
            // Rows written before consumedQty existed have no value; null
            // matches both missing and null, so they are claimable at 0.
            consumedQty: observedConsumed === 0 ? { $in: [0, null] } : observedConsumed,
          },
        },
      },
      {
        $inc: { 'workRows.$.consumedQty': consumeQty },
        $set: { 'workRows.$.status': newStatus },
      },
      { runValidators: false }
    );

    if (updateResult.matchedCount > 0) break;

    // No match: either the row is gone, or someone else consumed first. Re-read
    // and re-check against the new remaining quantity.
    attempt += 1;
    if (attempt >= CONSUME_MAX_ATTEMPTS) {
      const error = new Error('Could not consume this work row — it is being updated concurrently. Try again.');
      error.statusCode = 409;
      throw error;
    }
  }

  // The claim stands but the movement is a separate write. If it fails, give
  // the quantity back rather than leaving consumption recorded with no
  // corresponding stock movement.
  try {
    await StockMovement.create({
      movement_uuid: uuid(),
      item_uuid: workRow.itemUuid || '',
      item_name: workRow.itemName,
      item_type: 'raw',
      movement_type: 'consume_in_production',
      qty_out: consumeQty,
      order_uuid: order.Order_uuid,
      order_number: order.Order_Number,
      reference_type: 'order_work_row',
      reference_id: workRowId,
      remarks: `Consumed for order #${order.Order_Number} by ${consumedBy}`,
    });
  } catch (err) {
    await Orders.updateOne(
      { ...filter, 'workRows.workRowId': workRowId },
      {
        $inc: { 'workRows.$.consumedQty': -consumeQty },
        $set: { 'workRows.$.status': workRow.status || 'in_progress' },
      },
      { runValidators: false }
    ).catch((rollbackErr) => {
      // Both writes failed: say so loudly, because the row is now overstated.
      logger.error(
        `Could not roll back work row ${workRowId} on order ${order.Order_uuid} after a stock movement failure: ${rollbackErr.message}`
      );
    });
    throw err;
  }

  return Orders.findOne(filter).lean();
}

module.exports = {
  getStockSummary,
  getAvailableQtyMap,
  consumeWorkRow,
};
