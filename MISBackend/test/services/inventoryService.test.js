require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Orders = require('../../src/repositories/order');
const Items = require('../../src/repositories/items');
const StockMovement = require('../../src/repositories/stockMovement');
const VendorMaster = require('../../src/repositories/vendorMaster');
const ProductionJob = require('../../src/repositories/productionJob');
const { getStockSummary, consumeWorkRow } = require('../../src/services/inventoryService');
const { enrichOrderItemsAndBuildWorkRows } = require('../../src/routes/Order/_shared');

describe('inventoryService.getStockSummary', () => {
  test('computes current qty as opening stock + purchases - consumption', async () => {
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
    expect(paperRow?.currentQty).toBe(120);
  });
});

describe('Order/_shared.enrichOrderItemsAndBuildWorkRows reservation', () => {
  let paperUuid;

  beforeEach(async () => {
    paperUuid = uuid();
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
  });

  test('fully reserves and marks the row assigned when stock covers the requirement', async () => {
    const { workRows } = await enrichOrderItemsAndBuildWorkRows(
      [{ lineId: 'l1', Item: 'Art Paper 300gsm', Item_uuid: paperUuid, Item_group: 'Paper', itemType: 'raw_material', Quantity: 50, Rate: 5, Amount: 250 }],
      null
    );
    const row = workRows.find((r) => r.itemUuid === paperUuid);
    expect(row?.reservedQty).toBe(50);
    expect(row?.status).toBe('assigned');
  });

  test('partially reserves and flags a shortfall when the order needs more than is available', async () => {
    const { workRows } = await enrichOrderItemsAndBuildWorkRows(
      [{ lineId: 'l2', Item: 'Art Paper 300gsm', Item_uuid: paperUuid, Item_group: 'Paper', itemType: 'raw_material', Quantity: 500, Rate: 5, Amount: 2500 }],
      null
    );
    const row = workRows.find((r) => r.itemUuid === paperUuid);
    expect(row?.reservedQty).toBe(120);
    expect(row?.status).toBe('pending');
    expect(row?.note).toMatch(/shortfall/i);
  });
});

describe('inventoryService.consumeWorkRow', () => {
  async function createOrderWithWorkRow() {
    const workRowId = uuid();
    const order = await Orders.create({
      Order_uuid: uuid(),
      Order_Number: Math.floor(Math.random() * 1_000_000),
      Customer_uuid: 'cust-1',
      Items: [{ Item: 'Art Paper 300gsm', Quantity: 50, Rate: 5, Amount: 250 }],
      workRows: [{
        workRowId,
        type: 'raw_material',
        itemUuid: uuid(),
        itemName: 'Art Paper 300gsm',
        unit: 'Sheets',
        requiredQty: 50,
        reservedQty: 50,
        consumedQty: 0,
        executionMode: 'stock',
        status: 'assigned',
      }],
    });
    return { order, workRowId };
  }

  test('a partial consume updates consumedQty/status and writes a matching StockMovement', async () => {
    const { order, workRowId } = await createOrderWithWorkRow();

    const before = await StockMovement.countDocuments({ reference_id: workRowId });
    expect(before).toBe(0);

    const afterPartial = await consumeWorkRow({ orderId: order._id, workRowId, qty: 20, consumedBy: 'tester' });
    const partialRow = afterPartial.workRows.find((r) => r.workRowId === workRowId);
    expect(partialRow.consumedQty).toBe(20);
    expect(partialRow.status).toBe('in_progress');

    const movement = await StockMovement.findOne({ reference_id: workRowId, qty_out: 20 }).lean();
    expect(movement).toBeTruthy();
  });

  test('consuming the remaining quantity brings status to done', async () => {
    const { order, workRowId } = await createOrderWithWorkRow();
    await consumeWorkRow({ orderId: order._id, workRowId, qty: 20, consumedBy: 'tester' });
    const afterFull = await consumeWorkRow({ orderId: order._id, workRowId, qty: 30, consumedBy: 'tester' });
    const fullRow = afterFull.workRows.find((r) => r.workRowId === workRowId);
    expect(fullRow.consumedQty).toBe(50);
    expect(fullRow.status).toBe('done');
  });

  test('rejects consuming more than the required quantity for a work row', async () => {
    const { order, workRowId } = await createOrderWithWorkRow();
    await consumeWorkRow({ orderId: order._id, workRowId, qty: 20 });
    await consumeWorkRow({ orderId: order._id, workRowId, qty: 30 });

    await expect(
      consumeWorkRow({ orderId: order._id, workRowId, qty: 1 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('vendor summary/order-ledger merge (ProductionJob printing jobs)', () => {
  // VendorWork was consolidated into ProductionJob (job_category: 'printing') —
  // see productionJob.js's driveFileId comment. /masters/summary and
  // /order-ledger (routes/Vendor.js) now fold ProductionJob rows into the
  // per-vendor totals instead; this exercises that same aggregation without
  // spinning up the whole Express app.
  test('a printing ProductionJob folds into per-vendor assigned totals and is retrievable for the order ledger', async () => {
    const vendorUuid = uuid();
    const order = await Orders.create({
      Order_uuid: uuid(),
      Order_Number: 2001,
      Customer_uuid: 'cust-1',
      Items: [{ Item: 'Art Paper 300gsm', Quantity: 50, Rate: 5, Amount: 250 }],
    });
    await VendorMaster.create({ Vendor_uuid: vendorUuid, Vendor_name: 'Acme Printers' });
    await ProductionJob.create({
      job_category: 'printing',
      vendor_uuid: vendorUuid,
      vendor_name: 'Acme Printers',
      order_uuid: order.Order_uuid,
      order_number: order.Order_Number,
      jobValue: 1500,
      status: 'sent',
    });

    const printJobs = await ProductionJob.find({ job_category: 'printing' }, { vendor_uuid: 1, jobValue: 1 }).lean();
    const assignedByVendor = {};
    for (const job of printJobs) {
      if (!assignedByVendor[job.vendor_uuid]) assignedByVendor[job.vendor_uuid] = { totalAssigned: 0, count: 0 };
      assignedByVendor[job.vendor_uuid].totalAssigned += Number(job.jobValue || 0);
      assignedByVendor[job.vendor_uuid].count += 1;
    }
    expect(assignedByVendor[vendorUuid]).toMatchObject({ totalAssigned: 1500, count: 1 });

    const ledgerRows = await ProductionJob.find({ vendor_uuid: vendorUuid, job_category: 'printing' }).lean();
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].order_uuid).toBe(order.Order_uuid);
  });
});
