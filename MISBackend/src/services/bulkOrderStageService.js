"use strict";

// Match the destination stages offered by the Workflow card action.
const BULK_MOVE_STAGES = new Set(["print", "fitting", "bind_packing", "ready", "delivered"]);
const MAX_BULK_ORDERS = 50;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

/**
 * Move a selected set through the exact same lifecycle writer as the
 * single-order action (rollback checks, history, tasks and delivery notices).
 * Bounded concurrency avoids hundreds of simultaneous database writes or WA
 * notifications. Per-order failures are returned, never silently dropped.
 */
async function bulkMoveOrderStages({ orderIds, stage, moveStage }) {
  const destination = String(stage || "").trim().toLowerCase();
  if (!BULK_MOVE_STAGES.has(destination)) throw invalid("Invalid Workflow destination stage");
  if (!Array.isArray(orderIds) || orderIds.length < 1 || orderIds.length > MAX_BULK_ORDERS) {
    throw invalid(`Select between 1 and ${MAX_BULK_ORDERS} orders`);
  }

  const ids = orderIds.map((id) => String(id || "").trim());
  if (ids.some((id) => !OBJECT_ID_RE.test(id))) throw invalid("Invalid order ID in selection");
  const uniqueIds = [...new Set(ids)];
  const applyStage = moveStage || require("./orderLifecycleService").updateOrderStage;
  const outcomes = new Array(uniqueIds.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: Math.min(4, uniqueIds.length) }, async () => {
    while (nextIndex < uniqueIds.length) {
      const index = nextIndex++;
      const orderId = uniqueIds[index];
      try {
        await applyStage({ orderId, stage: destination });
        outcomes[index] = { orderId, success: true };
      } catch (error) {
        outcomes[index] = {
          orderId,
          success: false,
          message: error?.message || "Unable to move order",
        };
      }
    }
  }));

  const movedIds = outcomes.filter((result) => result.success).map((result) => result.orderId);
  const failures = outcomes.filter((result) => !result.success)
    .map(({ orderId, message }) => ({ orderId, message }));

  return {
    success: failures.length === 0,
    stage: destination,
    requested: uniqueIds.length,
    moved: movedIds.length,
    failed: failures.length,
    movedIds,
    failures,
  };
}

module.exports = { bulkMoveOrderStages, BULK_MOVE_STAGES, MAX_BULK_ORDERS };
