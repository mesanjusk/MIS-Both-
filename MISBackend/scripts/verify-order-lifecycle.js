// Standalone verification for the consolidated order-stage logic
// (src/constants/orderStages.js, orderLifecycleService.updateOrderStage,
// businessWorkflowService.moveOrderStage/assignVendorToOrder).
//
// Spins up a throwaway in-memory MongoDB (mongodb-memory-server) — never
// touches MONGO_URI / the real database. Run with:
//   npm run verify:order-lifecycle
//
// Requires outbound internet access to download the mongod binary on first
// run (cached under ~/.cache/mongodb-binaries after that). This could not be
// executed inside the sandbox that wrote this script (its network policy
// blocks fastdl.mongodb.org), so run it once in your own environment before
// trusting this change.

const path = require('path');

async function main() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongoose = require('mongoose');
  const { v4: uuid } = require('uuid');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const Orders = require(path.join(__dirname, '..', 'src', 'repositories', 'order'));
  const { updateOrderStage } = require(path.join(__dirname, '..', 'src', 'services', 'orderLifecycleService'));
  const { moveOrderStage, assignVendorToOrder } = require(path.join(__dirname, '..', 'src', 'services', 'businessWorkflowService'));
  const { CLOSED_STAGES } = require(path.join(__dirname, '..', 'src', 'constants', 'orderStages'));

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) {
      failures += 1;
      console.error('  FAIL:', msg);
    } else {
      console.log('  ok:', msg);
    }
  }

  let order = await Orders.create({
    Order_uuid: uuid(),
    Order_Number: 1001,
    Customer_uuid: 'cust-1',
    Items: [{ Item: 'Business Cards', Quantity: 100, Rate: 2, Amount: 200 }],
  });
  assert(order.stage === 'enquiry', 'new order defaults to enquiry stage');
  assert(Array.isArray(order.approvalRounds) && order.approvalRounds.length === 0, 'approvalRounds defaults to empty array');

  await updateOrderStage({ orderId: order._id, stage: 'new_design' });
  order = await Orders.findById(order._id);
  assert(order.stage === 'new_design', 'stage advanced to new_design');
  assert(order.stageHistory.length === 2, 'stageHistory recorded the move');

  let rollbackRejected = false;
  try {
    await updateOrderStage({ orderId: order._id, stage: 'enquiry' });
  } catch (e) {
    rollbackRejected = true;
    assert(e.statusCode === 400, 'rollback rejection is a 400');
  }
  assert(rollbackRejected, 'rollback from new_design back to enquiry is rejected');

  // Design-loop exception: a revision request should be able to send an
  // order from 'approval' back to 'old_design', unlike a normal rollback.
  await updateOrderStage({ orderId: order._id, stage: 'approval' });
  await updateOrderStage({ orderId: order._id, stage: 'old_design' });
  order = await Orders.findById(order._id);
  assert(order.stage === 'old_design', 'approval -> old_design (revision loop) is allowed');

  let outOfLoopRollbackRejected = false;
  try {
    await updateOrderStage({ orderId: order._id, stage: 'approved' });
  } catch (e) {
    outOfLoopRollbackRejected = true;
  }
  assert(outOfLoopRollbackRejected, 'moving backward out of the design loop into approved is still rejected');

  await updateOrderStage({ orderId: order._id, stage: 'approval' });

  await moveOrderStage({ orderUuid: order.Order_uuid, stage: 'print', assignedTo: 'Test User', note: 'sent to printer' });
  order = await Orders.findById(order._id);
  assert(order.stage === 'print', 'businessWorkflowService.moveOrderStage advanced stage to print');
  assert(order.Status.length === 1, 'moveOrderStage appended a Status[] entry');
  assert(order.Status[0].Task === 'print - sent to printer', 'Status entry carries the note as task label');

  let order2 = await Orders.create({
    Order_uuid: uuid(),
    Order_Number: 1002,
    Customer_uuid: 'cust-2',
    Items: [{ Item: 'Banners', Quantity: 2, Rate: 500, Amount: 1000 }],
  });
  await updateOrderStage({ orderId: order2._id, stage: 'lost' });
  order2 = await Orders.findById(order2._id);
  assert(order2.stage === 'lost', 'order can be marked lost directly from enquiry');
  assert(CLOSED_STAGES.has(order2.stage), 'lost is recognized as a closed stage');

  let terminalRejected = false;
  try {
    await updateOrderStage({ orderId: order2._id, stage: 'new_design' });
  } catch (e) {
    terminalRejected = true;
  }
  assert(terminalRejected, 'cannot move a lost order back into an active stage');

  let order3 = await Orders.create({
    Order_uuid: uuid(),
    Order_Number: 1003,
    Customer_uuid: 'cust-3',
    Items: [{ Item: 'Brochures', Quantity: 50, Rate: 10, Amount: 500 }],
    stage: 'new_design',
    stageHistory: [{ stage: 'enquiry' }, { stage: 'new_design' }],
  });
  await assignVendorToOrder({ orderUuid: order3.Order_uuid, vendorName: 'Acme Printers', amount: 300, workType: 'Printing' });
  order3 = await Orders.findById(order3._id);
  assert(order3.stage === 'print', 'assigning a vendor mid-flow jumps stage forward to print');
  assert(order3.vendorAssignments.length === 1, 'vendor assignment recorded on the order');

  await mongoose.disconnect();
  await mongod.stop();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll order-lifecycle checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
