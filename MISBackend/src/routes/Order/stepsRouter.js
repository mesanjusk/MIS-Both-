"use strict";
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuid } = require("uuid");
const Orders = require("../../repositories/order");
const Transaction = require("../../repositories/transaction");
const VendorLedger = require("../../repositories/vendorLedger");
const logger = require("../../utils/logger");
const { norm, normLower, escapeRegex } = require("../../utils/orderHelpers");

/* ------------------ CREATE STEP ------------------ */
router.post("/orders/:orderId/steps", async (req, res) => {
  const { orderId } = req.params;
  const {
    uuid: stepUuid,
    label,
    vendorCustomerUuid = null,
    vendorId = null,
    vendorName = null,
    costAmount = 0,
    plannedDate = null,
    checked = false,
    status = "pending",
  } = req.body;
  if (!label || typeof label !== "string") return res.status(400).json({ ok: false, error: "label is required" });
  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ ok: false, error: "Order not found" });
    const step = {
      uuid: stepUuid ? String(stepUuid).trim() : undefined,
      label: String(label).trim(),
      normLabel: normLower(label),
      checked: !!checked,
      vendorId: vendorCustomerUuid ?? vendorId ?? null,
      vendorName,
      costAmount: Number(costAmount || 0),
      plannedDate: plannedDate ? new Date(plannedDate) : undefined,
      status,
      posting: { isPosted: false, txnId: null, postedAt: null },
    };
    order.Steps = Array.isArray(order.Steps) ? order.Steps : [];
    order.Steps.push(step);
    await order.save();
    const created = order.Steps[order.Steps.length - 1];
    res.json({ ok: true, stepId: created._id, steps: order.Steps });
  } catch (e) {
    logger.error("create step error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ------------------ EDIT STEP ------------------ */
router.patch("/orders/:orderId/steps/:stepId", async (req, res) => {
  const { orderId, stepId } = req.params;
  const allowed = ["uuid", "label", "vendorId", "vendorCustomerUuid", "vendorName", "costAmount", "plannedDate", "status", "checked"];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ ok: false, error: "Order not found" });
    const step = order.Steps.id(stepId);
    if (!step) return res.status(404).json({ ok: false, error: "Step not found" });
    if ("plannedDate" in patch && patch.plannedDate) patch.plannedDate = new Date(patch.plannedDate);
    if ("costAmount" in patch) patch.costAmount = Number(patch.costAmount || 0);
    if ("vendorCustomerUuid" in patch && patch.vendorCustomerUuid && !patch.vendorId) {
      patch.vendorId = patch.vendorCustomerUuid;
    }
    if ("label" in patch && patch.label) {
      patch.label = String(patch.label).trim();
      patch.normLabel = normLower(patch.label);
    }
    if ("uuid" in patch && patch.uuid) patch.uuid = String(patch.uuid).trim();
    Object.assign(step, patch);
    await order.save();
    res.json({ ok: true, step });
  } catch (e) {
    logger.error("edit step error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* --------- ASSIGN VENDOR & POST (purchase journal) --------- */
router.post("/orders/:orderId/steps/:stepId/assign-vendor", async (req, res) => {
  const { orderId, stepId } = req.params;
  const { vendorId, vendorName, vendorCustomerUuid, costAmount, plannedDate, createdBy } = req.body;
  const resolvedVendor = vendorId || vendorCustomerUuid || vendorName;
  if (!resolvedVendor) return res.status(400).json({ ok: false, error: "Provide vendorId or vendorCustomerUuid or vendorName" });
  const amount = Number(costAmount ?? 0);
  if (Number.isNaN(amount) || amount < 0) return res.status(400).json({ ok: false, error: "Invalid costAmount" });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Orders.findById(orderId).session(session);
      if (!order) throw new Error("Order not found");
      const step = order.Steps.id(stepId);
      if (!step) throw new Error("Step not found");
      step.vendorId = vendorCustomerUuid ?? vendorId ?? step.vendorId ?? null;
      step.vendorName = vendorName ?? step.vendorName ?? null;
      step.costAmount = amount;
      if (plannedDate) step.plannedDate = new Date(plannedDate);
      if (step.posting?.isPosted) {
        await order.save({ session });
        return res.json({ ok: true, message: "Vendor saved. Step already posted.", txnId: step.posting.txnId });
      }
      if (amount === 0) {
        step.status = "done";
        step.posting = { isPosted: false, txnId: null, postedAt: null };
        await order.save({ session });
        return res.json({ ok: true, message: "Vendor saved (no posting for 0 amount)." });
      }
      const lines = [
        { Account_id: `${resolvedVendor}`, Type: "Debit", Amount: amount },
        { Account_id: process.env.PURCHASE_ACCOUNT_UUID || "fdf29a16-1e87-4f57-82d6-6b31040d3f1e", Type: "Credit", Amount: amount },
      ];
      const txnDate = plannedDate ? new Date(plannedDate) : new Date();
      const lastTxn = await Transaction.findOne({}, { Transaction_id: 1 })
        .sort({ Transaction_id: -1 })
        .session(session)
        .lean();
      const nextId = (lastTxn?.Transaction_id || 0) + 1;
      const txnDocs = await Transaction.create(
        [{
          Transaction_uuid: uuid(),
          Transaction_id: nextId,
          Order_uuid: order.Order_uuid || null,
          Order_number: order.Order_Number,
          Transaction_date: txnDate,
          Description: `Outsource step: ${step.label} (Order #${order.Order_Number})`,
          Total_Debit: amount,
          Total_Credit: amount,
          Payment_mode: "purchase",
          Created_by: createdBy || "system",
          image: null,
          Journal_entry: lines,
        }],
        { session }
      );
      await VendorLedger.findOneAndUpdate(
        {
          vendor_uuid: step.vendorId || resolvedVendor,
          order_uuid: order.Order_uuid,
          reference_type: "order_step_bill",
          reference_id: String(step._id),
        },
        {
          $set: {
            vendor_name: step.vendorName || vendorName || "",
            date: txnDate,
            entry_type: "job_bill",
            order_number: order.Order_Number,
            amount,
            dr_cr: "cr",
            narration: `Posted outsourced step ${step.label} for order #${order.Order_Number}`,
            transaction_uuid: txnDocs[0].Transaction_uuid || "",
          },
          $setOnInsert: {
            reference_type: "order_step_bill",
            reference_id: String(step._id),
          },
        },
        { upsert: true, session }
      );
      step.posting = { isPosted: true, txnId: txnDocs[0]._id, postedAt: new Date() };
      step.status = "posted";
      await order.save({ session });
      res.json({ ok: true, txnId: txnDocs[0]._id, transactionId: nextId });
    });
  } catch (e) {
    logger.error("assign-vendor error:", e);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    session.endSession();
  }
});

/* ------------------ TOGGLE STEP (add/remove) ------------------ */
router.post("/steps/toggle", async (req, res) => {
  try {
    const { orderId, step = {}, checked } = req.body || {};
    if (!orderId || typeof checked !== "boolean") {
      return res.status(400).json({ success: false, message: "orderId and checked are required" });
    }
    const uuidStr = norm(step.uuid || "");
    const label = norm(step.label || "");
    const labelNorm = normLower(label);
    if (!uuidStr && !label) {
      return res.status(400).json({ success: false, message: "Provide step.uuid or step.label" });
    }
    const find = { _id: orderId };
    if (checked) {
      const doc = await Orders.findOne(find, { Steps: 1 }).lean();
      if (!doc) return res.status(404).json({ success: false, message: "Order not found" });
      const exists = Array.isArray(doc.Steps) && doc.Steps.some((s) =>
        (uuidStr && String(s.uuid || "") === uuidStr) ||
        (label && normLower(s.normLabel || s.label || "") === labelNorm)
      );
      if (exists) return res.json({ success: true, updated: false });
      const now = new Date();
      await Orders.updateOne(find, {
        $push: {
          Steps: {
            uuid: uuidStr || undefined,
            label,
            normLabel: labelNorm,
            checked: true,
            vendorId: null,
            vendorName: null,
            costAmount: 0,
            plannedDate: undefined,
            status: "pending",
            posting: { isPosted: false, txnId: null, postedAt: null },
            addedAt: now,
          },
        },
      });
      return res.json({ success: true, updated: true });
    }
    // UNCHECK — remove step
    const pullOr = [];
    if (uuidStr) pullOr.push({ uuid: uuidStr });
    if (label) {
      pullOr.push({ normLabel: labelNorm });
      pullOr.push({ label: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, "i") });
    }
    const result = await Orders.updateOne(find, { $pull: { Steps: { $or: pullOr } } });
    return res.json({ success: true, updated: result.modifiedCount > 0 });
  } catch (e) {
    logger.error("/order/steps/toggle error", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
