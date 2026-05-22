"use strict";
const express = require("express");
const router = express.Router();
const Orders = require("../../repositories/order");
const ProductionJob = require("../../repositories/productionJob");
const logger = require("../../utils/logger");
const { escapeRegex, idToFilter } = require("../../utils/orderHelpers");
const { latestStatusProjectionStages } = require("./_shared");

router.get("/all-data", async (_req, res) => {
  try {
    const [delivered, report, outstanding, allvendors, bills] = await Promise.all([
      Orders.find({ Status: { $elemMatch: { Task: "Delivered" } } }).lean(),
      Orders.find({ Status: { $elemMatch: { Task: "Delivered" } }, Items: { $exists: true, $not: { $size: 0 } } }).lean(),
      Orders.find({ Status: { $not: { $elemMatch: { Task: "Delivered" } } } }).lean(),
      Orders.aggregate([
        { $addFields: { stepsNeedingVendor: { $filter: { input: "$Steps", as: "st", cond: { $or: [{ $eq: ["$$st.vendorId", null] }, { $eq: ["$$st.vendorId", ""] }, { $eq: ["$$st.posting.isPosted", false] }] } } } } },
        { $match: { "stepsNeedingVendor.0": { $exists: true } } },
        { $project: { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, ItemsRemarks: "$Items.Remark", StepsPending: { $map: { input: "$stepsNeedingVendor", as: "s", in: { stepId: "$$s._id", label: "$$s.label", vendorId: "$$s.vendorId", vendorName: "$$s.vendorName", costAmount: "$$s.costAmount", isPosted: "$$s.posting.isPosted" } } } } },
        { $sort: { Order_Number: -1 } },
      ]),
      Orders.find({ Status: { $elemMatch: { Task: "Delivered" } }, $or: [{ Items: { $exists: false } }, { Items: { $size: 0 } }] }).lean(),
    ]);
    res.json({ delivered, report, outstanding, allvendors, bills });
  } catch (error) {
    logger.error("Error generating unified report:", error.message);
    res.status(500).json({ success: false, message: "Failed to load report data" });
  }
});

router.patch("/bills/:id/status", async (req, res) => {
  try {
    const filter = idToFilter(String(req.params.id || "").trim());
    if (!filter) return res.status(400).json({ success: false, message: "Invalid Order id" });
    const incoming = String(req.body?.billStatus || "").toLowerCase().trim();
    if (!["paid", "unpaid"].includes(incoming)) return res.status(400).json({ success: false, message: "billStatus must be 'paid' or 'unpaid'" });
    const billPaidAt = incoming === "paid" ? new Date() : null;
    const set = { billStatus: incoming, billPaidAt, billPaidBy: incoming === "paid" ? (req.body?.paidBy ? String(req.body.paidBy).trim() : "system") : null, billPaidNote: incoming === "paid" ? (req.body?.paidNote || null) : null, billPaidTxnUuid: incoming === "paid" ? (req.body?.txnUuid || null) : null, billPaidTxnId: incoming === "paid" ? (req.body?.txnId ?? null) : null };
    const upd = await Orders.updateOne(filter, { $set: set }, { runValidators: false });
    if (upd.matchedCount === 0) return res.status(404).json({ success: false, message: "Order not found" });
    return res.json({ success: true, result: { billStatus: incoming, billPaidAt, billPaidBy: set.billPaidBy } });
  } catch (e) {
    logger.error("PATCH /order/bills/:id/status error:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/GetOrderList", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "500", 10), 1), 1000);
    const stage = req.query.stage ? String(req.query.stage).trim() : null;
    const matchStage = { latestTaskLower: { $nin: ["delivered", "cancel", "cancelled"] } };
    if (stage) matchStage.stage = stage;
    const rows = await Orders.aggregate([...latestStatusProjectionStages, { $match: matchStage }, { $sort: { createdAt: -1 } }, { $limit: limit }]);
    res.json({ success: true, result: rows });
  } catch (err) {
    logger.error("GetOrderList error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/GetDeliveredList", async (_req, res) => {
  try {
    const rows = await Orders.find({
      $or: [
        { stage: { $in: ["delivered", "paid"] } },
        { Status: { $elemMatch: { Task: { $regex: "delivered", $options: "i" } } } },
      ],
    }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, result: rows });
  } catch (err) {
    logger.error("GetDeliveredList error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/GetBillList", async (_req, res) => {
  try {
    const rows = await Orders.aggregate([...latestStatusProjectionStages, { $match: { latestTaskLower: "delivered", hasBillable: true } }]);
    res.json({ success: true, result: rows });
  } catch (err) {
    logger.error("GetBillList error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/GetBillListPaged", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const skip = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const paid = String(req.query.paid || "").trim().toLowerCase();
    const rx = search ? new RegExp(escapeRegex(search), "i") : null;
    const amountToDouble = (path) => ({ $convert: { input: { $replaceAll: { input: { $replaceAll: { input: { $replaceAll: { input: { $toString: { $ifNull: [path, "0"] } }, find: "₹", replacement: "" } }, find: ",", replacement: "" } }, find: " ", replacement: "" } }, to: "double", onError: 0, onNull: 0 } });
    const pipeline = [
      { $addFields: { latestStatus: { $cond: [{ $gt: [{ $size: { $ifNull: ["$Status", []] } }, 0] }, { $arrayElemAt: ["$Status", { $subtract: [{ $size: "$Status" }, 1] }] }, null] } } },
      { $addFields: { latestTaskLower: { $toLower: { $trim: { input: { $ifNull: ["$latestStatus.Task", ""] } } } }, billStatusLower: { $toLower: { $trim: { input: { $ifNull: ["$billStatus", ""] } } } }, hasBillable: { $anyElementTrue: { $map: { input: { $ifNull: ["$Items", []] }, as: "it", in: { $gt: [amountToDouble("$$it.Amount"), 0] } } } } } },
      { $match: { latestTaskLower: "delivered", hasBillable: true } },
      ...(paid ? [{ $match: { billStatusLower: paid } }] : []),
      ...(rx ? [{ $match: { $or: [{ Customer_uuid: rx }, { "Items.Remark": rx }, ...(Number.isFinite(Number(search)) ? [{ Order_Number: Number(search) }] : [])] } }] : []),
      { $sort: { Order_Number: -1 } },
      { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: "count" }] } },
    ];
    const result = await Orders.aggregate(pipeline);
    return res.json({ success: true, result: result?.[0]?.data || [], total: result?.[0]?.total?.[0]?.count || 0, page, limit });
  } catch (err) {
    logger.error("GetBillListPaged error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/CheckCustomer/:customerUuid", async (req, res) => {
  try {
    const orderExists = await Orders.findOne({ Customer_uuid: req.params.customerUuid }).lean();
    res.json({ exists: !!orderExists });
  } catch (error) {
    logger.error("Error checking orders:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/CheckMultipleCustomers", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, message: "ids array required" });
    const linked = await Orders.distinct("Customer_uuid", { Customer_uuid: { $in: ids } });
    res.json({ linkedIds: linked });
  } catch (err) {
    logger.error("CheckMultipleCustomers error:", err);
    res.status(500).json({ success: false, message: "Error checking linked orders" });
  }
});

router.get("/allvendors-raw", async (req, res) => {
  try {
    const deliveredOnly = String(req.query.deliveredOnly || "").toLowerCase() === "true";
    const pipeline = [
      { $project: { Order_Number: 1, Customer_uuid: 1, Items: 1, Steps: 1, Status: 1, latestStatus: { $cond: [{ $gt: [{ $size: { $ifNull: ["$Status", []] } }, 0] }, { $arrayElemAt: ["$Status", { $subtract: [{ $size: "$Status" }, 1] }] }, null] } } },
      { $addFields: { RemarkText: { $let: { vars: { rems: { $filter: { input: { $map: { input: { $ifNull: ["$Items", []] }, as: "it", in: { $trim: { input: { $ifNull: ["$$it.Remark", ""] } } } } }, as: "r", cond: { $ne: ["$$r", ""] } } } }, in: { $reduce: { input: "$$rems", initialValue: "", in: { $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", " | ", "$$this"] }] } } } } } } },
      ...(deliveredOnly ? [{ $match: { "latestStatus.Task": "Delivered" } }] : []),
      { $sort: { Order_Number: -1 } },
    ];
    const rows = await Orders.aggregate(pipeline);
    res.json({ rows, total: rows.length });
  } catch (e) {
    logger.error("allvendors-raw error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/allvendors", async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const match = {};
    if (search) { const num = +search; match.$or = [{ Order_Number: Number.isNaN(num) ? -1 : num }, { Customer_uuid: new RegExp(escapeRegex(search), "i") }, { "Items.Remark": new RegExp(escapeRegex(search), "i") }]; }
    const rows = await Orders.aggregate([
      { $match: Object.keys(match).length ? match : {} },
      { $addFields: { stepsNeedingVendor: { $filter: { input: "$Steps", as: "st", cond: { $or: [{ $eq: ["$$st.vendorId", null] }, { $eq: ["$$st.vendorId", ""] }, { $eq: ["$$st.posting.isPosted", false] }] } } } } },
      { $match: { "stepsNeedingVendor.0": { $exists: true } } },
      { $project: { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, Items: 1, StepsPending: { $map: { input: "$stepsNeedingVendor", as: "s", in: { stepId: "$$s._id", label: "$$s.label", vendorId: "$$s.vendorId", vendorName: "$$s.vendorName", costAmount: "$$s.costAmount", isPosted: "$$s.posting.isPosted" } } } } },
      { $sort: { Order_Number: -1 } },
    ]);
    res.json({ rows, total: rows.length });
  } catch (e) {
    logger.error("allvendors error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/reports/planning", async (_req, res) => {
  try {
    const [orders, jobs] = await Promise.all([
      Orders.find({}, { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, stage: 1, dueDate: 1, assignedTo: 1, vendorAssignments: 1, Steps: 1, Status: 1, createdAt: 1 }).sort({ createdAt: -1 }).lean(),
      ProductionJob.find({}).sort({ job_date: -1, createdAt: -1 }).lean(),
    ]);
    const orderRows = orders.map((order) => {
      const latestStatusTask = Array.isArray(order.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;
      const linkedJobs = jobs.filter((job) => Array.isArray(job.linkedOrders) && job.linkedOrders.some((e) => String(e?.orderUuid || "") === String(order.Order_uuid)));
      return { ...order, latestStatusTask, vendorJobCount: linkedJobs.length, vendorJobCost: linkedJobs.reduce((s, j) => s + Number(j.jobValue || 0), 0), unassignedDesign: String(latestStatusTask?.Task || order.stage || "").toLowerCase().includes("design") && (!latestStatusTask?.Assigned || String(latestStatusTask?.Assigned || "").toLowerCase() === "none") };
    });
    return res.json({ success: true, result: { orders: orderRows, jobs } });
  } catch (error) {
    logger.error("planning report error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load planning report" });
  }
});

router.get("/design-unassigned", async (_req, res) => {
  try {
    const { getUnassignedOrders } = require("../../services/orderTaskService");
    const rows = await getUnassignedOrders();
    return res.json({ success: true, result: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to load unassigned orders" });
  }
});

router.get("/reports/vendor-missing", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const skip = (page - 1) * limit;
    const deliveredOnly = req.query.deliveredOnly === "true";
    const search = (req.query.search || "").trim();
    const match = {};
    if (deliveredOnly) match.Status = { $elemMatch: { Task: "Delivered" } };
    if (search) { const num = +search; match.$or = [{ Order_Number: Number.isNaN(num) ? -1 : num }, { Customer_uuid: new RegExp(escapeRegex(search), "i") }, { "Items.Remark": new RegExp(escapeRegex(search), "i") }]; }
    const pipeline = [
      { $match: match },
      { $addFields: { stepsNeedingVendor: { $filter: { input: "$Steps", as: "st", cond: { $or: [{ $eq: ["$$st.vendorId", null] }, { $eq: ["$$st.vendorId", ""] }, { $eq: ["$$st.posting.isPosted", false] }] } } } } },
      { $match: { "stepsNeedingVendor.0": { $exists: true } } },
      { $project: { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, Items: 1, StepsPending: { $map: { input: "$stepsNeedingVendor", as: "s", in: { stepId: "$$s._id", label: "$$s.label", vendorId: "$$s.vendorId", vendorName: "$$s.vendorName", costAmount: "$$s.costAmount", isPosted: "$$s.posting.isPosted" } } } } },
      { $sort: { Order_Number: -1 } },
      { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: "count" }] } },
    ];
    const result = await Orders.aggregate(pipeline);
    res.json({ page, limit, total: result?.[0]?.total?.[0]?.count || 0, rows: result?.[0]?.data || [] });
  } catch (e) {
    logger.error("reports/vendor-missing error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
