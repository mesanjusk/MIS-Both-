"use strict";

const { bulkMoveOrderStages, MAX_BULK_ORDERS } = require("./bulkOrderStageService");

const ids = [
  "507f1f77bcf86cd799439011",
  "507f1f77bcf86cd799439012",
  "507f1f77bcf86cd799439013",
];

describe("Workflow bulk stage move", () => {
  it("moves each selected unique order through the normal lifecycle writer", async () => {
    const moveStage = jest.fn().mockResolvedValue({});
    const result = await bulkMoveOrderStages({
      orderIds: [ids[0], ids[0], ids[1]], stage: "fitting", moveStage,
    });
    expect(result).toMatchObject({ requested: 2, moved: 2, failed: 0, movedIds: ids.slice(0, 2) });
    expect(moveStage).toHaveBeenCalledTimes(2);
    expect(moveStage).toHaveBeenCalledWith({ orderId: ids[0], stage: "fitting" });
    expect(moveStage).toHaveBeenCalledWith({ orderId: ids[1], stage: "fitting" });
  });

  it("returns individual rollback failures without losing successful updates", async () => {
    const moveStage = jest.fn(async ({ orderId }) => {
      if (orderId === ids[1]) throw Object.assign(new Error("Stage rollback not allowed"), { statusCode: 400 });
    });
    const result = await bulkMoveOrderStages({ orderIds: ids, stage: "ready", moveStage });
    expect(result).toMatchObject({ requested: 3, moved: 2, failed: 1, movedIds: [ids[0], ids[2]] });
    expect(result.failures).toEqual([{ orderId: ids[1], message: "Stage rollback not allowed" }]);
  });

  it("rejects invalid destination, IDs and oversized requests before any writes", async () => {
    const moveStage = jest.fn();
    await expect(bulkMoveOrderStages({ orderIds: ids, stage: "cancelled", moveStage }))
      .rejects.toThrow("Invalid Workflow destination stage");
    await expect(bulkMoveOrderStages({ orderIds: ["bad-id"], stage: "print", moveStage }))
      .rejects.toThrow("Invalid order ID");
    await expect(bulkMoveOrderStages({ orderIds: [], stage: "print", moveStage }))
      .rejects.toThrow("Select between");
    await expect(bulkMoveOrderStages({
      orderIds: Array(MAX_BULK_ORDERS + 1).fill(ids[0]), stage: "print", moveStage,
    })).rejects.toThrow("Select between");
    expect(moveStage).not.toHaveBeenCalled();
  });

  it("accepts Delivered as a terminal destination through the lifecycle writer", async () => {
    const moveStage = jest.fn().mockResolvedValue({});
    const result = await bulkMoveOrderStages({ orderIds: [ids[0]], stage: "delivered", moveStage });
    expect(result.moved).toBe(1);
    expect(moveStage).toHaveBeenCalledWith({ orderId: ids[0], stage: "delivered" });
  });
});
