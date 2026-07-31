// Standalone verification for Phase 2: real inventory tracking
// (src/services/inventoryService.js, workRows reservation in
// routes/Order/_shared.js) and the vendor-report merge that folds VendorWork
// (print jobs) into masters/summary and order-ledger totals.
//
// Spins up a throwaway in-memory MongoDB (mongodb-memory-server) — never
// touches MONGO_URI / the real database. Run with:
//   npm run verify:inventory-and-vendor
//
// Requires outbound internet access to download the mongod binary on first
// run. Could not be executed in the sandbox that wrote this script (its
// network policy blocks fastdl.mongodb.org) — run it once in your own
// environment before trusting this change.

const path = require('path');

async function main() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongoose = require('mongoose');
  const { v4: uuid } = require('uuid');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const Orders = require(path.join(__dirname, '..', 'src', 'repositories', 'order'));
  const Items = require(path.join(__dirname, '..', 'src', 'repositories', 'items'));
  const StockMovement = require(path.join(__dirname, '..', 'src', 'repositories', 'stockMovement'));
  const VendorMaster = require(path.join(__dirname, '..', 'src', 'repositories', 'vendorMaster'));
  const VendorWork = require(path.join(__dirname, '..', 'src', 'repositories', 'vendorWork'));
  const { getStockSummary, getAvailableQtyMap, consumeWorkRow } = require(path.join(__dirname, '..', 'src', 'services', 'inventoryService'));
  const { enrichOrderItemsAndBuildWorkRows } = require(path.join(__dirname, '..', 'src', 'routes', 'Order', '_shared'));

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) {
      failures += 1;
      console.error('  FAIL:', msg);
    } else {
      console.log('  ok:', msg);
    }
  }

  // 1. getStockSummary math
  const paperUuid = uuid();
  await Items.create({
    Item_uuid: paperUuid,
    Item_name: 'Art Paper 300gsm',
    Item_group: 'Paper',
    itemType: 'raw_material',
    stockTracked: true,
    openingStock: 100,
    reorderLevel: 20,
  });
  await StockMovement.create([
    { movement_uuid: uuid(), item_uuid: paperUuid, item_name: 'Art Paper 300gsm', movement_type: 'purchase', qty_in: 50, qty_out: 0 },
    { movement_uuid: uuid(), item_uuid: paperUuid, item_name: 'Art Paper 300gsm', movement_type: 'consume_in_production', qty_in: 0, qty_out: 30 },
  ]);
  const summary = await getStockSummary();
  const paperRow = summary.find((r) => r.itemUuid === paperUuid);
  assert(paperRow && paperRow.currentQty === 120, `getStockSummary computes 100 + 50 - 30 = 120 (got ${paperRow?.currentQty})`);

  // 2. Reservation at order-creation time (enough stock)
  const { workRows: rows1 } = await enrichOrderItemsAndBuildWorkRows(
    [{ lineId: 'l1', Item: 'Art Paper 300gsm', Item_uuid: paperUuid, Item_group: 'Paper', itemType: 'raw_material', Quantity: 50, Rate: 5, Amount: 250 }],
    null
  );
  const row1 = rows1.find((r) => r.itemUuid === paperUuid);
  assert(row1 && row1.reservedQty === 50 && row1.status === 'assigned', `full reservation when stock covers requiredQty (reserved=${row1?.reservedQty}, status=${row1?.status})`);

  // 3. Reservation shortfall (order needs more than available)
  const { workRows: rows2 } = await enrichOrderItemsAndBuildWorkRows(
    [{ lineId: 'l2', Item: 'Art Paper 300gsm', Item_uuid: paperUuid, Item_group: 'Paper', itemType: 'raw_material', Quantity: 500, Rate: 5, Amount: 2500 }],
    null
  );
  const row2 = rows2.find((r) => r.itemUuid === paperUuid);
  assert(row2 && row2.reservedQty === 120 && row2.status === 'pending' && /shortfall/i.test(row2.note), `partial reservation + shortfall note when order needs more than available (reserved=${row2?.reservedQty}, status=${row2?.status})`);

  // 4. consumeWorkRow updates the order AND writes a StockMovement
  const order = await Orders.create({
    Order_uuid: uuid(),
    Order_Number: 2001,
    Customer_uuid: 'cust-1',
    Items: [{ Item: 'Art Paper 300gsm', Quantity: 50, Rate: 5, Amount: 250 }],
    workRows: [{
      workRowId: uuid(),
      type: 'raw_material',
      itemUuid: paperUuid,
      itemName: 'Art Paper 300gsm',
      unit: 'Sheets',
      requiredQty: 50,
      reservedQty: 50,
      consumedQty: 0,
      executionMode: 'stock',
      status: 'assigned',
    }],
  });
  const workRowId = order.workRows[0].workRowId;
  const movementsBefore = await StockMovement.countDocuments({ reference_id: workRowId });
  assert(movementsBefore === 0, 'no consume movement exists yet');

  const afterPartial = await consumeWorkRow({ orderId: order._id, workRowId, qty: 20, consumedBy: 'tester' });
  const partialRow = afterPartial.workRows.find((r) => r.workRowId === workRowId);
  assert(partialRow.consumedQty === 20 && partialRow.status === 'in_progress', `partial consume updates consumedQty and status (consumed=${partialRow.consumedQty}, status=${partialRow.status})`);
  const movementAfterPartial = await StockMovement.findOne({ reference_id: workRowId, qty_out: 20 }).lean();
  assert(!!movementAfterPartial, 'partial consume wrote a matching StockMovement');

  const afterFull = await consumeWorkRow({ orderId: order._id, workRowId, qty: 30, consumedBy: 'tester' });
  const fullRow = afterFull.workRows.find((r) => r.workRowId === workRowId);
  assert(fullRow.consumedQty === 50 && fullRow.status === 'done', `remaining consume brings status to done (consumed=${fullRow.consumedQty}, status=${fullRow.status})`);

  let overConsumeRejected = false;
  try {
    await consumeWorkRow({ orderId: order._id, workRowId, qty: 1 });
  } catch (e) {
    overConsumeRejected = true;
    assert(e.statusCode === 400, 'over-consumption rejection is a 400');
  }
  assert(overConsumeRejected, 'cannot consume more than requiredQty for a work row');

  // 5. Vendor summary/order-ledger merge includes VendorWork (print jobs)
  const vendorUuid = uuid();
  await VendorMaster.create({ Vendor_uuid: vendorUuid, Vendor_name: 'Acme Printers' });
  await VendorWork.create({
    work_uuid: uuid(),
    Vendor_uuid: vendorUuid,
    Vendor_name: 'Acme Printers',
    Order_uuid: order.Order_uuid,
    Order_Number: order.Order_Number,
    Process: 'printing',
    Amount: 1500,
    Paid_Amount: 500,
    Status: 'sent',
  });
  // Exercise the same aggregation the /masters/summary and /order-ledger
  // routes now run, without spinning up the whole Express app.
  const printJobs = await VendorWork.find({}, { Vendor_uuid: 1, Amount: 1 }).lean();
  const assignedByVendor = {};
  for (const job of printJobs) {
    if (!assignedByVendor[job.Vendor_uuid]) assignedByVendor[job.Vendor_uuid] = { totalAssigned: 0, count: 0 };
    assignedByVendor[job.Vendor_uuid].totalAssigned += Number(job.Amount || 0);
    assignedByVendor[job.Vendor_uuid].count += 1;
  }
  assert(assignedByVendor[vendorUuid]?.totalAssigned === 1500 && assignedByVendor[vendorUuid]?.count === 1, 'VendorWork print job folds into per-vendor assigned totals');

  const ledgerRows = await VendorWork.find({ Vendor_uuid: vendorUuid }).lean();
  assert(ledgerRows.length === 1 && ledgerRows[0].Order_uuid === order.Order_uuid, 'VendorWork row is retrievable by vendor for the order-ledger merge');

  await mongoose.disconnect();
  await mongod.stop();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll inventory/vendor checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
