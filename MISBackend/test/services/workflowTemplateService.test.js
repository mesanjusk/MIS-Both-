require('../helpers/mongoSetup');
const { v4: uuid } = require('uuid');
const Orders = require('../../src/repositories/order');
const ItemWorkflowTemplate = require('../../src/repositories/itemWorkflowTemplate');
const { applyWorkflowToOrder, completeWorkflowStep } = require('../../src/services/workflowTemplateService');

const createOrder = (overrides = {}) =>
  Orders.create({
    Order_uuid: uuid(),
    Order_Number: Math.floor(Math.random() * 1_000_000),
    Customer_uuid: 'cust-1',
    Items: [{ Item: 'Business Cards', Quantity: 100, Rate: 2, Amount: 200 }],
    ...overrides,
  });

const createTemplate = (steps) =>
  ItemWorkflowTemplate.create({
    template_uuid: uuid(),
    itemNamePattern: 'business cards',
    steps,
  });

describe('workflowTemplateService stage auto-advance', () => {
  test('applyWorkflowToOrder advances order.stage and records stageHistory via orderLifecycleService', async () => {
    const order = await createOrder();
    await createTemplate([
      { order: 1, label: 'Design', stage: 'new_design' },
      { order: 2, label: 'Print', stage: 'print' },
    ]);

    await applyWorkflowToOrder(order._id, ['Business Cards']);

    const updated = await Orders.findById(order._id);
    expect(updated.stage).toBe('new_design');
    expect(updated.stageHistory.map((h) => h.stage)).toEqual(['enquiry', 'new_design']);
    expect(updated.workflowSteps[0].status).toBe('active');
  });

  test('completeWorkflowStep advances to the next step stage, still forward-only', async () => {
    let order = await createOrder();
    await createTemplate([
      { order: 1, label: 'Design', stage: 'new_design' },
      { order: 2, label: 'Print', stage: 'print' },
    ]);

    await applyWorkflowToOrder(order._id, ['Business Cards']);
    order = await Orders.findById(order._id);
    const firstStepId = order.workflowSteps[0].stepId;

    await completeWorkflowStep(order._id, firstStepId);

    const updated = await Orders.findById(order._id);
    expect(updated.stage).toBe('print');
    expect(updated.stageHistory.map((h) => h.stage)).toEqual(['enquiry', 'new_design', 'print']);
    expect(updated.workflowSteps[0].status).toBe('done');
    expect(updated.workflowSteps[1].status).toBe('active');
  });

  test('does not roll the order stage backward if it already moved ahead by another path', async () => {
    let order = await createOrder();
    await createTemplate([{ order: 1, label: 'Design', stage: 'new_design' }]);

    const { updateOrderStage } = require('../../src/services/orderLifecycleService');
    await updateOrderStage({ orderId: order._id, stage: 'new_design' });
    await updateOrderStage({ orderId: order._id, stage: 'approval' });
    await updateOrderStage({ orderId: order._id, stage: 'ready_to_print' });

    // Template step targets 'new_design', which is now behind the order's
    // real stage — applyWorkflowToOrder must not throw or roll it back.
    await expect(applyWorkflowToOrder(order._id, ['Business Cards'])).resolves.toBeTruthy();

    const updated = await Orders.findById(order._id);
    expect(updated.stage).toBe('ready_to_print');
  });
});
