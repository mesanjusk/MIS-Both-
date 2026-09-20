"use strict";
const express = require("express");
const router = express.Router();
const Orders = require("../../repositories/order");
const VendorLedger = require("../../repositories/vendorLedger");
const logger = require("../../utils/logger");
const { norm, normLower, escapeRegex } = require("../../utils/orderHelpers");
const { consumeWorkRow } = require("../../services/inventoryService");
const {
  upsertVendorBill,
  reverseAndDeleteTransaction,
  BUSINESS_SOURCES,
} = require("../../services/accountingPostingService");

function stepPostingSource(order, step) {
  return `${BUSINESS_SOURCES.VENDOR_BILL}:order_step:${order.Order_uuid}:${step._id}`;
}

async function removeStepAccounting(order, step) {
  const source = stepPostingSource(order, step);
  await reverseAndDeleteTransaction({ Source: source });
  await VendorLedger.deleteMany({
    order_uuid: order.Order_uuid,
    reference_type: "order_step_bill",
    reference_id: String(step._id),
  });
  step.posting = { isPosted: false, txnId: null, postedAt: null };
}

async function syncStepAccounting(order, step, { createdBy = "system", txnDate = null } = {}) {
  const amount = Number(step.costAmount || 0);
  if (!(amount > 0)) {
    await removeStepAccounting(order, step);
    if (step.status === "posted") step.status = "done";
    return null;
  }

  const vendorUuid = String(step.vendorId || "").trim();
  if (!vendorUuid) {
    const error = new Error("Vendor is required before posting an outsourced step");
    error.statusCode = 400;
    throw error;
  }

  const sourceSuffix = `order_step:${order.Order_uuid}:${step._id}`;
  const source = stepPostingSource(order, step);
  let posting = null;
  try {
    posting = await upsertVendorBill({
      amount,
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      createdBy,
      transactionDate: txnDate || step.plannedDate || new Date(),
      partyName: step.vendorName || vendorUuid,
      narration: `Outsource step: ${step.label}`,
      description: `Outsource step: ${step.label} (Order #${order.Order_Number})`,
      sourceSuffix,
    });

    const txn = posting?.transaction;
    if (!txn?.Transaction_uuid) throw new Error("Vendor bill transaction was not created");

    await VendorLedger.findOneAndUpdate(
      {
        order_uuid: order.Order_uuid,
        reference_type: "order_step_bill",
        reference_id: String(step._id),
      },
      {
        $set: {
          vendor_uuid: vendorUuid,
          vendor_name: step.vendorName || "",
          date: txnDate || step.plannedDate || new Date(),
          entry_type: "job_bill",
          order_number: order.Order_Number,
          amount,
          dr_cr: "cr",
          narration: `Posted outsourced step ${step.label} for order #${order.Order_Number}`,
          transaction_uuid: txn.Transaction_uuid,
        },
        $setOnInsert: {
          reference_type: "order_step_bill",
          reference_id: String(step._id),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    step.posting = { isPosted: true, txnId: txn._id, postedAt: new Date() };
    step.status = "posted";
    return posting;
  } catch (error) {
    // Never leave one side of the sub-ledger/general-ledger pair behind.
    await VendorLedger.deleteMany({
      order_uuid: order.Order_uuid,
      reference_type: "order_step_bill",
      reference_id: String(step._id),
    }).catch(() => {});
    await reverseAndDeleteTransaction({ Source: source }).catch(() => {});
    throw error;
  }
}

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
    const wasPosted = Boolean(step.posting?.isPosted);
    Object.assign(step, patch);

    const financialFields = ["label", "vendorId", "vendorCustomerUuid", "vendorName", "costAmount", "plannedDate"];
    if (wasPosted && financialFields.some((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
      await syncStepAccounting(order, step, {
        createdBy: req.user?.userName || req.user?.User_name || "system",
        txnDate: step.plannedDate || new Date(),
      });
    }

    await order.save();
    res.json({ ok: true, step });
  } catch (e) {
    logger.error("edit step error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* --------- ASSIGN VENDOR & POST (unified accounting journal) --------- */
router.post("/orders/:orderId/steps/:stepId/assign-vendor", async (req, res) => {
  const { orderId, stepId } = req.params;
  const { vendorId, vendorName, vendorCustomerUuid, costAmount, plannedDate, createdBy } = req.body;
  const resolvedVendor = vendorCustomerUuid || vendorId || vendorName;
  if (!resolvedVendor) {
    return res.status(400).json({ ok: false, error: "Provide vendorId, vendorCustomerUuid or vendorName" });
  }

  const amount = Number(costAmount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ ok: false, error: "Invalid costAmount" });
  }

  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ ok: false, error: "Order not found" });
    const step = order.Steps.id(stepId);
    if (!step) return res.status(404).json({ ok: false, error: "Step not found" });

    step.vendorId = vendorCustomerUuid ?? vendorId ?? step.vendorId ?? null;
    step.vendorName = vendorName ?? step.vendorName ?? null;
    step.costAmount = amount;
    if (plannedDate) step.plannedDate = new Date(plannedDate);

    const posting = await syncStepAccounting(order, step, {
      createdBy: createdBy || req.user?.userName || req.user?.User_name || "system",
      txnDate: plannedDate ? new Date(plannedDate) : new Date(),
    });

    await order.save();

    if (!posting) {
      return res.json({ ok: true, message: "Vendor saved; zero amount has no financial posting." });
    }

    return res.json({
      ok: true,
      txnId: posting.transaction?._id,
      transactionId: posting.transaction?.Transaction_id,
      transactionUuid: posting.transaction?.Transaction_uuid,
    });
  } catch (e) {
    logger.error("assign-vendor error:", e);
    res.status(e.statusCode || 500).json({ ok: false, error: e.message });
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
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const matchedSteps = (order.Steps || []).filter((s) =>
      (uuidStr && String(s.uuid || "") === uuidStr) ||
      (label && normLower(s.normLabel || s.label || "") === labelNorm)
    );
    for (const stepDoc of matchedSteps) {
      await removeStepAccounting(order, stepDoc);
    }

    const result = await Orders.updateOne(find, { $pull: { Steps: { $or: pullOr } } });
    return res.json({ success: true, updated: result.modifiedCount > 0 });
  } catch (e) {
    logger.error("/order/steps/toggle error", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ------------------ CONSUME WORK ROW MATERIAL ------------------ */
router.patch("/orders/:orderId/workrows/:workRowId/consume", async (req, res) => {
  const { orderId, workRowId } = req.params;
  const { qty, consumedBy } = req.body || {};
  try {
    const order = await consumeWorkRow({
      orderId,
      workRowId,
      qty,
      consumedBy: consumedBy || req.user?.userName || req.user?.User_name || "system",
    });
    return res.json({ success: true, result: order });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to consume work row",
    });
  }
});

module.exports = router;
