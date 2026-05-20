"use strict";
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { patchOrderStage, listOrderTasks } = require("../../controllers/orderLifecycleController");
const {
  assignOrderToUser,
  getPendingOrdersForUser,
  getUnassignedOrders,
  buildTaskSummaryMessage,
} = require("../../services/orderTaskService");
const logger = require("../../utils/logger");
const { idToFilter, parseStatusPayload } = require("../../utils/orderHelpers");
const { pushStatusOnly } = require("./_shared");

router.get("/tasks/mine", async (req, res) => {
  try {
    const userName = String(req.query?.userName || req.user?.userName || "").trim();
    if (!userName) return res.status(400).json({ success: false, message: "userName is required" });
    const rows = await getPendingOrdersForUser(userName);
    return res.json({
      success: true,
      orders: rows.orders,
      summary: buildTaskSummaryMessage({ employee: userName, orders: rows.orders }),
    });
  } catch (error) {
    logger.error("tasks/mine error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch order tasks" });
  }
});

router.get("/tasks/queue", async (_req, res) => {
  try {
    const rows = await getUnassignedOrders();
    return res.json({ success: true, orders: rows });
  } catch (error) {
    logger.error("tasks/queue error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch order queue" });
  }
});

router.patch("/:id/assign", async (req, res) => {
  try {
    const assignedValue = String(req.body?.assignedTo || "").trim();
    const updated = await assignOrderToUser({
      orderId: req.params.id,
      userId: mongoose.isValidObjectId(assignedValue) ? assignedValue : null,
      userName: mongoose.isValidObjectId(assignedValue) ? null : assignedValue,
      assignedBy: req.body?.assignedBy || req.user?.userName || "System",
      via: "app",
    });
    return res.json({ success: true, order: updated });
  } catch (error) {
    logger.error("assign order error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to assign order" });
  }
});

router.patch("/:id/stage", patchOrderStage);

router.post("/:id/lifecycle", async (req, res) => {
  try {
    const action = String(req.body?.action || "").trim().toLowerCase();
    const stage = req.body?.stage || (action === "mark_delivered" ? "delivered" : "");
    if (!stage) return res.status(400).json({ success: false, message: "stage is required" });
    req.body.stage = stage;
    return patchOrderStage(req, res);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to update lifecycle" });
  }
});

router.get("/:id/tasks", listOrderTasks);

router.post("/updateStatus", async (req, res) => {
  const { id, task } = parseStatusPayload(req);
  if (!id || !task) return res.status(400).json({ success: false, message: "Order id and Task are required" });
  const filter = idToFilter(id);
  if (!filter) return res.status(400).json({ success: false, message: "Invalid Order id" });
  const out = await pushStatusOnly(filter, task, "DragDrop");
  if (!out.ok) return res.status(out.code || 500).json({ success: false, message: out.msg });
  return res.json({ success: true, message: "Status updated" });
});

router.put("/updateStatus/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  const task = String(req.body?.Task || req.body?.task || "").trim();
  if (!id || !task) return res.status(400).json({ success: false, message: "Order id and Task are required" });
  const filter = idToFilter(id);
  if (!filter) return res.status(400).json({ success: false, message: "Invalid Order id" });
  const out = await pushStatusOnly(filter, task, "DragDrop");
  if (!out.ok) return res.status(out.code || 500).json({ success: false, message: out.msg });
  return res.json({ success: true, message: "Status updated" });
});

router.post("/addStatus", async (req, res) => {
  const { id, task } = parseStatusPayload(req);
  if (!id || !task) return res.status(400).json({ success: false, message: "Order id and Task are required" });
  const filter = idToFilter(id);
  if (!filter) return res.status(400).json({ success: false, message: "Invalid Order id" });
  const out = await pushStatusOnly(filter, task, "API");
  if (!out.ok) return res.status(out.code || 500).json({ success: false, message: out.msg });
  return res.json({ success: true, message: "Status added" });
});

module.exports = router;
