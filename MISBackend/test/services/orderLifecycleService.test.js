require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Orders = require('../../src/repositories/order');
const { updateOrderStage } = require('../../src/services/orderLifecycleService');
const { moveOrderStage, assignVendorToOrder } = require('../../src/services/businessWorkflowService');
const { CLOSED_STAGES } = require('../../src/constants/orderStages');

const createOrder = (overrides = {}) =>
  Orders.create({
    Order_uuid: uuid(),
    Order_Number: Math.floor(Math.random() * 1_000_000),
    Customer_uuid: 'cust-1',
    Items: [{ Item: 'Business Cards', Quantity: 100, Rate: 2, Amount: 200 }],
    ...overrides,
  });

describe('orderLifecycleService.updateOrderStage', () => {
  test('a new order defaults to the enquiry stage with no stage history', async () => {
    const order = await createOrder();
    expect(order.stage).toBe('enquiry');
    expect(order.approvalRounds).toEqual([]);
  });

  test('advances stage forward and records stageHistory', async () => {
    let order = await createOrder();
    await updateOrderStage({ orderId: order._id, stage: 'new_design' });
    order = await Orders.findById(order._id);
    expect(order.stage).toBe('new_design');
    expect(order.stageHistory).toHaveLength(2);
  });

  test('rejects moving a stage backward outside the design loop', async () => {
    let order = await createOrder();
    await updateOrderStage({ orderId: order._id, stage: 'new_design' });

    await expect(
      updateOrderStage({ orderId: order._id, stage: 'enquiry' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('allows the approval <-> old_design revision loop', async () => {
    let order = await createOrder();
    await updateOrderStage({ orderId: order._id, stage: 'new_design' });
    await updateOrderStage({ orderId: order._id, stage: 'approval' });
    await updateOrderStage({ orderId: order._id, stage: 'old_design' });
    order = await Orders.findById(order._id);
    expect(order.stage).toBe('old_design');
  });

  test('still rejects moving backward out of the design loop into a closed earlier stage', async () => {
    let order = await createOrder();
    await updateOrderStage({ orderId: order._id, stage: 'new_design' });
    await updateOrderStage({ orderId: order._id, stage: 'approval' });
    await updateOrderStage({ orderId: order._id, stage: 'old_design' });

    await expect(
      updateOrderStage({ orderId: order._id, stage: 'approved' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('an order can be marked lost directly from enquiry, and lost is a closed stage', async () => {
    let order = await createOrder();
    await updateOrderStage({ orderId: order._id, stage: 'lost' });
    order = await Orders.findById(order._id);
    expect(order.stage).toBe('lost');
    expect(CLOSED_STAGES.has(order.stage)).toBe(true);
  });

  test('rejects moving a lost order back into an active stage', async () => {
    let order = await createOrder();
    await updateOrderStage({ orderId: order._id, stage: 'lost' });

    await expect(
      updateOrderStage({ orderId: order._id, stage: 'new_design' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects an invalid stage name', async () => {
    const order = await createOrder();
    await expect(
      updateOrderStage({ orderId: order._id, stage: 'not_a_real_stage' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects when the order cannot be found', async () => {
    await expect(
      updateOrderStage({ orderId: new (require('mongoose').Types.ObjectId)(), stage: 'new_design' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('self-heals a legacy stage alias instead of rejecting the move', async () => {
    let order = await createOrder({ stage: 'design', stageHistory: [{ stage: 'design' }] });
    await updateOrderStage({ orderId: order._id, stage: 'print' });
    order = await Orders.findById(order._id);
    expect(order.stage).toBe('print');
  });
});

describe('businessWorkflowService.moveOrderStage', () => {
  test('advances stage and appends a Status[] entry carrying the note', async () => {
    let order = await createOrder({ stage: 'approval', stageHistory: [{ stage: 'enquiry' }, { stage: 'approval' }] });
    await moveOrderStage({ orderUuid: order.Order_uuid, stage: 'print', assignedTo: 'Test User', note: 'sent to printer' });
    order = await Orders.findById(order._id);
    expect(order.stage).toBe('print');
    expect(order.Status).toHaveLength(1);
    expect(order.Status[0].Task).toBe('print - sent to printer');
  });
});

describe('businessWorkflowService.assignVendorToOrder', () => {
  test('assigning a vendor mid-flow jumps the stage forward to print and records the assignment', async () => {
    let order = await createOrder({ stage: 'new_design', stageHistory: [{ stage: 'enquiry' }, { stage: 'new_design' }] });
    await assignVendorToOrder({ orderUuid: order.Order_uuid, vendorName: 'Acme Printers', amount: 300, workType: 'Printing' });
    order = await Orders.findById(order._id);
    expect(order.stage).toBe('print');
    expect(order.vendorAssignments).toHaveLength(1);
  });
});
