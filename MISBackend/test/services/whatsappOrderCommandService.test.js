require('../helpers/mongoSetup');
const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');
const Orders = require('../../src/repositories/order');
const { findOrdersForStaff } = require('../../src/services/whatsappOrderCommandService');

const createOrder = (overrides = {}) =>
  Orders.create({
    Order_uuid: uuid(),
    Order_Number: Math.floor(Math.random() * 1_000_000),
    Customer_uuid: 'cust-1',
    Items: [{ Item: 'Business Cards', Quantity: 100, Rate: 2, Amount: 200 }],
    ...overrides,
  });

describe('whatsappOrderCommandService.findOrdersForStaff', () => {
  test('viewScope "all" returns every open order regardless of assignment, excluding closed stages', async () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    await createOrder({ assignedTo: userA, stage: 'enquiry' });
    await createOrder({ assignedTo: userB, stage: 'print' });
    await createOrder({ assignedTo: userA, stage: 'delivered' }); // closed, must be excluded

    const orders = await findOrdersForStaff({ user: { _id: userA }, permissions: { viewScope: 'all' } });
    expect(orders).toHaveLength(2);
    expect(orders.every((o) => o.stage !== 'delivered')).toBe(true);
  });

  test('a restricted viewScope only returns orders assigned to that staff member', async () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    await createOrder({ assignedTo: userA, stage: 'enquiry' });
    await createOrder({ assignedTo: userB, stage: 'print' });

    const orders = await findOrdersForStaff({ user: { _id: userA }, permissions: { viewScope: 'assigned' } });
    expect(orders).toHaveLength(1);
    expect(String(orders[0].assignedTo)).toBe(String(userA));
  });

  test('a restricted viewScope excludes closed-stage orders even when assigned to that staff member', async () => {
    const userA = new mongoose.Types.ObjectId();
    await createOrder({ assignedTo: userA, stage: 'paid' });

    const orders = await findOrdersForStaff({ user: { _id: userA }, permissions: { viewScope: 'assigned' } });
    expect(orders).toHaveLength(0);
  });

  test('a restricted viewScope never returns an unassigned order', async () => {
    const userA = new mongoose.Types.ObjectId();
    await createOrder({ stage: 'enquiry' }); // no assignedTo

    const orders = await findOrdersForStaff({ user: { _id: userA }, permissions: { viewScope: 'assigned' } });
    expect(orders).toHaveLength(0);
  });
});
