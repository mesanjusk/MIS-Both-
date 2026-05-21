"use strict";
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Orders = require("../../repositories/order");
const ProductionJob = require("../../repositories/productionJob");
const VendorLedger = require("../../repositories/vendorLedger");
const { buildDefaultDueDate } = require("../../services/orderTaskService");
const logger = require("../../utils/logger");
const { norm, toDate, idToFilter, normalizeItems, normalizeSteps } = require("../../utils/orderHelpers");
const {
  resolveOfficeAssignee,
  normalizeVendorAssignments,
  enrichOrderItemsAndBuildWorkRows,
  syncVendorJobsForOrder,
} = require("./_shared");

/* ----------------------- UPDATE ORDER (generic) ----------------------- */
router.put("/updateOrder/:id", async (req, res) => {
  try {
    const {
      Delivery_Date, Items, Steps, vendorAssignments, orderMode, orderNote,
      assignedTo, assignToUserId, assignToUserUuid, stage, productionStepsEnabled,
      ...otherFields
    } = req.body;

    const filter = mongoose.isValidObjectId(req.params.id)
      ? { _id: req.params.id }
      : { Order_uuid: req.params.id };
    const order = await Orders.findOne(filter);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (Items) {
      const incomingItems = normalizeItems(Items);
      const { enrichedItems, workRows } = await enrichOrderItemsAndBuildWorkRows(incomingItems, order.dueDate || null);
      order.Items = enrichedItems;
      order.workRows = workRows;
      order.orderMode = String(orderMode || (incomingItems.length ? "items" : "note")).toLowerCase() === "items" ? "items" : "note";
    }

    if (typeof orderNote !== "undefined") {
      order.orderNote = norm(orderNote);
      order.Remark = norm(orderNote);
    }

    if (typeof otherFields.Remark !== "undefined" && typeof orderNote === "undefined") {
      order.orderNote = norm(otherFields.Remark);
      order.Remark = norm(otherFields.Remark);
      delete otherFields.Remark;
    }

    if (productionStepsEnabled === false) {
      order.Steps = [];
    } else if (Array.isArray(Steps)) {
      order.Steps = normalizeSteps(Steps);
    }

    if (Array.isArray(vendorAssignments)) {
      order.vendorAssignments = await normalizeVendorAssignments(vendorAssignments);
    }

    if (otherFields.dueDate) {
      order.dueDate = toDate(otherFields.dueDate, order.dueDate || new Date());
      delete otherFields.dueDate;
    }

    if (otherFields.priority) {
      const p = String(otherFields.priority).toLowerCase();
      if (["low", "medium", "high"].includes(p)) order.priority = p;
      delete otherFields.priority;
    }

    if (Delivery_Date) {
      const lastIndex = (order.Status?.length || 1) - 1;
      if (lastIndex >= 0) {
        order.Status[lastIndex].Delivery_Date = toDate(Delivery_Date, order.Status[lastIndex].Delivery_Date);
      }
      order.dueDate = toDate(Delivery_Date, order.dueDate || new Date());
    }

    if (stage) {
      order.stage = String(stage).trim().toLowerCase();
      order.stageHistory = Array.isArray(order.stageHistory) ? order.stageHistory : [];
      const latestStage = order.stageHistory[order.stageHistory.length - 1]?.stage;
      if (latestStage !== order.stage) {
        order.stageHistory.push({ stage: order.stage, timestamp: new Date() });
      }
    }

    Object.assign(order, otherFields);

    if (assignedTo || assignToUserId || assignToUserUuid) {
      const assignedUser = await resolveOfficeAssignee(assignedTo || assignToUserId || assignToUserUuid);
      if (assignedUser) {
        order.assignedTo = assignedUser._id;
        if (Array.isArray(order.Status) && order.Status.length) {
          const last = order.Status[order.Status.length - 1];
          last.Assigned = assignedUser.User_name;
          last.Delivery_Date = order.dueDate || buildDefaultDueDate();
        }
      }
    }

    const saved = await order.save();
    let vendorJobs = [];
    if (Array.isArray(saved.vendorAssignments) && saved.vendorAssignments.length) {
      vendorJobs = await syncVendorJobsForOrder(
        saved,
        saved.vendorAssignments,
        req.body?.updatedBy || req.user?.userName || "system"
      );
    } else {
      await ProductionJob.deleteMany({ "linkedOrders.orderUuid": saved.Order_uuid });
      await VendorLedger.deleteMany({
        order_uuid: saved.Order_uuid,
        reference_type: { $in: ["vendor_assignment", "vendor_assignment_bill", "vendor_assignment_advance"] },
      });
    }

    const refreshed = await Orders.findById(saved._id).lean();
    return res.json({ success: true, result: refreshed, vendorJobs, message: "Order updated successfully" });
  } catch (err) {
    logger.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ----------------------- UPDATE DELIVERY (Items only) ----------------------- */
router.put("/updateDelivery/:id", async (req, res) => {
  const { id } = req.params;
  const { Customer_uuid, Items, invoiceTxnUuid, invoiceTxnId } = req.body;
  try {
    const isObjectId = mongoose.isValidObjectId(id);
    const filter = isObjectId ? { _id: id } : { Order_uuid: id };
    const incoming = normalizeItems(Items || []);
    if (!Customer_uuid && incoming.length === 0 && !invoiceTxnUuid) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }
    const update = {};
    const setFields = {};
    if (Customer_uuid) setFields.Customer_uuid = Customer_uuid;
    if (invoiceTxnUuid) setFields.invoiceTxnUuid = String(invoiceTxnUuid);
    if (invoiceTxnId != null) setFields.invoiceTxnId = Number(invoiceTxnId);
    if (incoming.length > 0) setFields.Items = incoming;
    if (Object.keys(setFields).length) update.$set = setFields;
    const result = await Orders.updateOne(filter, update, { runValidators: false });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const refreshed = await Orders.findOne(filter).lean();
    return res.status(200).json({ success: true, message: "Order updated successfully", result: refreshed });
  } catch (error) {
    logger.error("Error updating order:", error);
    res.status(500).json({ success: false, message: "Error updating order", error: error.message });
  }
});

/* ------------------ BILL STATUS (Paid/Unpaid) ------------------ */
router.patch("/bills/:id/status", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const filter = idToFilter(id);
    if (!filter) return res.status(400).json({ success: false, message: "Invalid Order id" });

    const incoming = String(req.body?.billStatus || "").toLowerCase().trim();
    if (!["paid", "unpaid"].includes(incoming)) {
      return res.status(400).json({ success: false, message: "billStatus must be 'paid' or 'unpaid'" });
    }

    const paidBy = req.body?.paidBy ? String(req.body.paidBy).trim() : null;
    const paidNote = req.body?.paidNote ? String(req.body.paidNote).trim() : null;
    const billPaidAt = incoming === "paid" ? new Date() : null;

    const set = {
      billStatus: incoming,
      billPaidAt,
      billPaidBy: incoming === "paid" ? (paidBy || "system") : null,
      billPaidNote: incoming === "paid" ? paidNote : null,
      billPaidTxnUuid: incoming === "paid" ? (req.body?.txnUuid || null) : null,
      billPaidTxnId: incoming === "paid" ? (req.body?.txnId ?? null) : null,
    };

    const upd = await Orders.updateOne(filter, { $set: set }, { runValidators: false });
    if (upd.matchedCount === 0) return res.status(404).json({ success: false, message: "Order not found" });

    return res.json({
      success: true,
      result: {
        billStatus: incoming,
        billPaidAt,
        billPaidBy: incoming === "paid" ? (paidBy || "system") : null,
      },
    });
  } catch (e) {
    logger.error("PATCH /order/bills/:id/status error:", e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
