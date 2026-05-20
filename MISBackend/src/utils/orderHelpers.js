"use strict";
const mongoose = require("mongoose");

const isProd = process.env.NODE_ENV === "production";

const norm = (s) => String(s || "").trim();
const normLower = (s) => String(s || "").trim().toLowerCase();
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toDate = (v, fallback = new Date()) => (v ? new Date(v) : fallback);

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return fallback;
};

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function idToFilter(anyId) {
  const id = String(anyId || "").trim();
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return { _id: id };
  if (/^\d+$/.test(id)) return { Order_Number: Number(id) };
  return { Order_uuid: id };
}

function parseStatusPayload(req) {
  const oldOrderId = req.body?.orderId;
  const oldNewStatus = req.body?.newStatus;
  const dndId = req.body?.Order_id;
  const dndTask = req.body?.Task;
  let id = dndId || oldOrderId || req.params?.id;
  let task = dndTask;
  if (!task && typeof oldNewStatus === "string") task = oldNewStatus;
  if (!task && oldNewStatus && typeof oldNewStatus === "object") task = oldNewStatus.Task;
  return { id: id ? String(id).trim() : "", task: task ? String(task).trim() : "" };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(Boolean)
    .map((it) => {
      const name = String(it.Item ?? it.item ?? "").trim();
      const qty = Number(it.Quantity ?? it.quantity ?? 0);
      const rate = Number(it.Rate ?? it.rate ?? 0);
      const amt = Number(it.Amount ?? it.amount ?? (qty * rate) ?? 0);
      return {
        Item: name,
        Quantity: qty,
        Rate: rate,
        Amount: amt,
        Priority: String(it.Priority ?? it.priority ?? "Normal"),
        Remark: String(it.Remark ?? it.remark ?? it.remarks ?? it.comment ?? it.note ?? ""),
      };
    })
    .filter((it) => it.Item);
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.reduce((acc, step) => {
    const label = typeof step?.label === "string" ? step.label.trim() : "";
    if (!label) return acc;
    const amount = Number(step.costAmount ?? 0);
    acc.push({
      uuid: typeof step?.uuid === "string" ? step.uuid.trim() : undefined,
      label,
      normLabel: normLower(label),
      checked: !!step.checked,
      vendorId: step.vendorCustomerUuid ?? step.vendorId ?? null,
      vendorName: step.vendorName ?? null,
      costAmount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
      plannedDate: step.plannedDate ? new Date(step.plannedDate) : undefined,
      status: step.status || "pending",
      posting: step.posting && typeof step.posting === "object"
        ? step.posting
        : { isPosted: false, txnId: null, postedAt: null },
    });
    return acc;
  }, []);
}

function mapVendorJobType(value = "") {
  const lower = String(value || "").trim().toLowerCase();
  if (!lower) return "manual";
  if (lower.includes("print")) return "printing";
  if (lower.includes("laminat")) return "lamination";
  if (lower.includes("cut")) return "cutting";
  if (lower.includes("pack")) return "packing";
  if (lower.includes("purchase")) return "purchase";
  if (["manual", "other"].includes(lower)) return lower;
  return "other";
}

module.exports = {
  isProd, norm, normLower, escapeRegex, toDate, toBool, toSafeNumber,
  idToFilter, parseStatusPayload, normalizeItems, normalizeSteps, mapVendorJobType,
};
