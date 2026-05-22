"use strict";
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { requireAuth } = require("../../middleware/auth");
const Orders = require("../../repositories/order");
const logger = require("../../utils/logger");

// All order routes require authentication
router.use(requireAuth);

// Sub-routers (order matters: named paths before /:id catch-all)
router.use("/", require("./createRouter"));
router.use("/", require("./statusRouter"));
router.use("/", require("./stepsRouter"));
router.use("/", require("./queriesRouter"));
router.use("/", require("./updateRouter"));

// GET /:id must be last to avoid capturing named routes
router.get("/:id", async (req, res) => {
  const orderId = req.params.id;
  try {
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ message: "Invalid order id" });
    }
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    logger.error("GET /order/:id error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
