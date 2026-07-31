"use strict";
const mongoose = require("mongoose");
const { v4: uuid } = require("uuid");
const Users = require("../../repositories/users");
const VendorMaster = require("../../repositories/vendorMaster");
const Orders = require("../../repositories/order");
const ItemsRepo = require("../../repositories/items");
const Counter = require("../../repositories/counter");
const { isDriveAutomationEnabled } = require("../../services/googleDriveOAuthService");
const { getAvailableQtyMap } = require("../../services/inventoryService");
const { upsertVendorJob, deleteStaleVendorJobs } = require("../../services/vendorJobService");
const logger = require("../../utils/logger");
const {
  norm, normLower, toDate, toBool, toSafeNumber, escapeRegex,
  normalizeSteps,
} = require("../../utils/orderHelpers");

const DEFAULT_ORDER_ASSIGNEE = process.env.DEFAULT_ORDER_ASSIGNEE || "Sai";
const OFFICE_USER_GROUP = "office user";
const isOfficeUser = (user = {}) => normLower(user.User_group) === OFFICE_USER_GROUP;

async function resolveAssignableUser(rawValue) {
  const value = norm(rawValue);
  if (!value) return null;
  const query = mongoose.isValidObjectId(value)
    ? { _id: value }
    : { $or: [{ User_uuid: value }, { User_name: value }, { Mobile_number: value }] };
  return Users.findOne(query).lean();
}

async function resolveDefaultOfficeAssignee() {
  const exact = await Users.findOne({
    User_name: new RegExp(`^${escapeRegex(DEFAULT_ORDER_ASSIGNEE)}$`, "i"),
    User_group: /^Office User$/i,
  }).lean();
  if (exact) return exact;
  const anyGroup = await Users.findOne({
    User_name: new RegExp(`^${escapeRegex(DEFAULT_ORDER_ASSIGNEE)}$`, "i"),
  }).lean();
  if (anyGroup) return anyGroup;
  return Users.findOne({ User_group: /^Office User$/i }).sort({ User_name: 1 }).lean();
}

async function resolveOfficeAssignee(rawValue, { fallbackToDefault = false } = {}) {
  const requested = await resolveAssignableUser(rawValue);
  if (requested && isOfficeUser(requested)) return requested;
  if (fallbackToDefault) return resolveDefaultOfficeAssignee();
  return null;
}

async function resolveVendorMasterFromPayload(row = {}) {
  const vendorUuid = norm(row.vendorUuid || row.vendor_uuid || row.vendorCustomerUuid || row.vendorId || row.Customer_uuid);
  const vendorName = norm(row.vendorName || row.vendor_name || row.Customer_name || row.name);
  if (vendorUuid) {
    const existing = await VendorMaster.findOne({ Vendor_uuid: vendorUuid }).lean();
    if (existing) return existing;
  }
  if (vendorName) {
    const byName = await VendorMaster.findOne({ Vendor_name: vendorName }).lean();
    if (byName) return byName;
    const created = await VendorMaster.create({
      Vendor_uuid: vendorUuid || uuid(),
      Vendor_name: vendorName,
      Vendor_type: row.jobMode === "vendor_with_material" ? "mixed" : "jobwork",
      Active: true,
      Jobwork_capable: true,
      Raw_material_capable: row.jobMode === "vendor_with_material",
    });
    return created.toObject ? created.toObject() : created;
  }
  return null;
}

async function normalizeVendorAssignments(assignments) {
  if (!Array.isArray(assignments)) return [];
  const rows = [];
  for (const row of assignments) {
    const vendor = await resolveVendorMasterFromPayload(row);
    const vendorUuid = norm(vendor?.Vendor_uuid || row?.vendorUuid || row?.vendor_uuid || row?.vendorCustomerUuid || row?.vendorId || row?.Customer_uuid);
    const vendorName = norm(vendor?.Vendor_name || row?.vendorName || row?.vendor_name || row?.Customer_name || row?.name);
    if (!vendorUuid || !vendorName) continue;
    const amount = toSafeNumber(row?.amount, 0);
    const qty = toSafeNumber(row?.qty, 0);
    const advanceAmount = toSafeNumber(row?.advanceAmount ?? row?.advance ?? row?.advance_paid, 0);
    const sequence = Math.max(1, Math.trunc(toSafeNumber(row?.sequence, rows.length + 1)));
    const jobModeRaw = String(row?.jobMode || row?.job_mode || "jobwork_only").toLowerCase();
    const jobMode = ["jobwork_only", "vendor_with_material", "own_material_sent", "mixed"].includes(jobModeRaw)
      ? jobModeRaw : "jobwork_only";
    rows.push({
      assignmentId: norm(row?.assignmentId) || undefined,
      vendorCustomerUuid: vendorUuid,
      vendorUuid,
      vendorName,
      workType: norm(row?.workType || row?.work || row?.label) || "General",
      sequence,
      inputItem: norm(row?.inputItem || row?.input_item),
      outputItem: norm(row?.outputItem || row?.output_item),
      jobMode,
      note: norm(row?.note || row?.remark || row?.description),
      qty: qty >= 0 ? qty : 0,
      amount: amount >= 0 ? amount : 0,
      advanceAmount: advanceAmount >= 0 ? advanceAmount : 0,
      dueDate: row?.dueDate ? new Date(row.dueDate) : null,
      paymentStatus: ["pending", "partial", "paid"].includes(String(row?.paymentStatus || "").toLowerCase())
        ? String(row.paymentStatus).toLowerCase()
        : advanceAmount > 0 && amount > advanceAmount ? "partial"
        : advanceAmount > 0 && amount <= advanceAmount && amount > 0 ? "paid"
        : "pending",
      status: ["pending", "in_progress", "completed"].includes(String(row?.status || "").toLowerCase())
        ? String(row.status).toLowerCase() : "pending",
    });
  }
  return rows.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
}

async function pushStatusOnly(filter, task, assignedHint = "System", overrides = {}) {
  try {
    const doc = await Orders.findOne(filter, { Status: { $slice: -1 }, _id: 1 }).lean();
    if (!doc) return { ok: false, code: 404, msg: "Order not found" };
    const last = Array.isArray(doc.Status) && doc.Status.length ? doc.Status[0] : null;
    const nextNo = Number(last?.Status_number || 0) + 1;
    const now = new Date();
    const entry = {
      Task: String(task || "").trim() || "Other",
      Assigned: String(overrides.assigned || last?.Assigned || assignedHint || "System"),
      Status_number: Number.isFinite(nextNo) ? nextNo : 1,
      Delivery_Date: overrides.deliveryDate instanceof Date ? overrides.deliveryDate : now,
      CreatedAt: now,
    };
    if (!entry.Task) return { ok: false, code: 400, msg: "Task is empty" };
    const upd = await Orders.updateOne(filter, { $push: { Status: entry } });
    if (upd.matchedCount === 0) return { ok: false, code: 404, msg: "Order not found" };
    if (upd.modifiedCount === 0) return { ok: false, code: 500, msg: "Failed to push status" };
    return { ok: true };
  } catch (e) {
    logger.error("[order.pushStatusOnly] error:", e);
    return { ok: false, code: 500, msg: "Internal error while updating status" };
  }
}

async function nextCounterValue(id, seed = 0) {
  const current = await Counter.findById(id).lean();
  if (!current?.seq) {
    await Counter.updateOne({ _id: id }, { $max: { seq: seed } }, { upsert: true });
  }
  const updated = await Counter.findByIdAndUpdate(
    id, { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(updated?.seq || 1);
}

async function syncVendorJobsForOrder(order, assignments = [], actor = "system") {
  if (!order?.Order_uuid) return [];
  const touchedJobIds = [];
  const createdOrUpdated = [];
  for (const row of assignments) {
    const assignmentId = String(row.assignmentId || "").trim();
    if (!assignmentId) continue;
    const jobStatus = row.status === "completed" ? "completed" : row.status === "in_progress" ? "in_progress" : "draft";
    const { job } = await upsertVendorJob({
      jobCategory: "post_printing",
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      orderItemLineId: assignmentId,
      vendorUuid: row.vendorUuid || row.vendorCustomerUuid,
      vendorName: row.vendorName,
      workType: row.workType,
      jobMode: row.jobMode || "jobwork_only",
      qty: row.qty,
      amount: row.amount,
      advanceAmount: row.advanceAmount,
      inputItem: row.inputItem,
      outputItem: row.outputItem,
      dueDate: row.dueDate || order.dueDate || new Date(),
      status: jobStatus,
      notes: row.note || "",
      createdBy: actor,
      postAccountingBill: false,
      referenceType: "vendor_job",
    });
    touchedJobIds.push(String(job._id));
    createdOrUpdated.push(job);
  }

  await deleteStaleVendorJobs(order.Order_uuid, touchedJobIds);
  return createdOrUpdated;
}

async function enrichOrderItemsAndBuildWorkRows(lineItems = [], inheritedDueDate = null) {
  const itemNames = [...new Set(lineItems.map((row) => norm(row.Item)).filter(Boolean))];
  const catalog = await ItemsRepo.find({ Item_name: { $in: itemNames } }).lean();
  const byName = new Map(catalog.map((item) => [norm(item.Item_name), item]));
  const workRows = [];

  const enrichedItems = lineItems.map((row) => {
    const itemDoc = byName.get(norm(row.Item));
    const qty = Number(row.Quantity || 0);
    const enriched = {
      ...row,
      Item_uuid: itemDoc?.Item_uuid || row.Item_uuid || "",
      Item_group: row.Item_group || itemDoc?.Item_group || "",
      itemType: row.itemType || itemDoc?.itemType || "finished_item",
      Rate: Number(row.Rate || itemDoc?.defaultSaleRate || 0),
    };
    enriched.Amount = Number(row.Amount || qty * Number(enriched.Rate || 0));

    if (itemDoc?.itemType === "finished_item" && Array.isArray(itemDoc?.bom) && itemDoc.bom.length) {
      itemDoc.bom.forEach((component) => {
        const compQtyBase = Number(component?.qty || 0);
        const wasteFactor = 1 + Number(component?.wastePercent || 0) / 100;
        const requiredQty = Number((qty * compQtyBase * wasteFactor).toFixed(4));
        workRows.push({
          sourceLineId: enriched.lineId,
          sourceItemUuid: enriched.Item_uuid || "",
          sourceItemName: enriched.Item,
          sourceBomComponentId: String(component?._id || ""),
          type: component?.componentType === "service" ? "service" : component?.componentType === "consumable" ? "consumable" : "raw_material",
          itemUuid: component?.componentItemUuid || "",
          itemName: component?.componentItemName,
          itemGroup: component?.itemGroup || "",
          unit: component?.unit || "Nos",
          requiredQty,
          reservedQty: 0,
          consumedQty: 0,
          executionMode: component?.executionMode || "stock",
          assignedVendorCustomerUuid: null,
          assignedVendorName: null,
          assignedUserUuid: null,
          assignedUserName: null,
          assignLater: true,
          status: "pending",
          estimatedCost: Number(component?.defaultCost || 0),
          actualCost: 0,
          note: component?.note || "",
          dueDate: inheritedDueDate || null,
        });
      });
    } else if (
      itemDoc?.itemType === "raw_material" ||
      itemDoc?.itemType === "service" ||
      itemDoc?.itemType === "consumable"
    ) {
      workRows.push({
        sourceLineId: enriched.lineId,
        sourceItemUuid: enriched.Item_uuid || "",
        sourceItemName: enriched.Item,
        sourceBomComponentId: "",
        type: itemDoc.itemType === "service" ? "service" : itemDoc.itemType === "consumable" ? "consumable" : "raw_material",
        itemUuid: enriched.Item_uuid || "",
        itemName: enriched.Item,
        itemGroup: enriched.Item_group || "",
        unit: itemDoc?.unit || "Nos",
        requiredQty: qty,
        reservedQty: 0,
        consumedQty: 0,
        executionMode: itemDoc?.executionMode || "stock",
        assignedVendorCustomerUuid: null,
        assignedVendorName: null,
        assignedUserUuid: null,
        assignedUserName: null,
        assignLater: true,
        status: "pending",
        estimatedCost: Number(itemDoc?.defaultPurchaseRate || 0),
        actualCost: 0,
        note: row.Remark || "",
        dueDate: inheritedDueDate || null,
      });
    }

    return enriched;
  });

  // Reserve against real current stock instead of leaving reservedQty at 0
  // (write-once, never-checked) as before — a shortfall is now visible on
  // the order immediately rather than silently assumed fine.
  const stockRowItemUuids = workRows
    .filter((row) => row.executionMode === "stock" && row.itemUuid)
    .map((row) => row.itemUuid);
  if (stockRowItemUuids.length) {
    const availableByItem = await getAvailableQtyMap(stockRowItemUuids);
    for (const row of workRows) {
      if (row.executionMode !== "stock" || !row.itemUuid || !availableByItem.has(row.itemUuid)) continue;
      const available = availableByItem.get(row.itemUuid);
      const reserved = Math.max(0, Math.min(row.requiredQty, available));
      row.reservedQty = reserved;
      if (reserved < row.requiredQty) {
        row.note = [row.note, `Stock shortfall: only ${reserved} of ${row.requiredQty} ${row.unit} available.`]
          .filter(Boolean)
          .join(" ");
      } else {
        row.status = "assigned";
      }
      // Decrement the running balance so multiple work rows needing the same
      // item within one order don't each reserve against the full amount.
      availableByItem.set(row.itemUuid, available - reserved);
    }
  }

  return { enrichedItems, workRows };
}

function resolveDrivePayloadConfig(body = {}) {
  const nestedGoogleDrive = body?.googleDrive && typeof body.googleDrive === "object" ? body.googleDrive : {};
  const templateFileId =
    norm(body?.templateFileId) ||
    norm(body?.driveTemplateFileId) ||
    norm(body?.driveSourceFileId) ||
    norm(body?.sourceTemplateFileId) ||
    norm(body?.sourceFileId) ||
    norm(nestedGoogleDrive?.sourceFileId) ||
    norm(process.env.DRIVE_TEMPLATE_FILE_ID);
  const targetFolderId =
    norm(body?.targetFolderId) ||
    norm(body?.driveFolderId) ||
    norm(body?.folderId) ||
    norm(nestedGoogleDrive?.folderId) ||
    norm(process.env.DRIVE_TARGET_FOLDER_ID);
  const automationEnabled = toBool(
    body?.createDriveFile ?? body?.shouldCreateDriveFile ?? body?.driveAutoCopy ?? nestedGoogleDrive?.enabled,
    isDriveAutomationEnabled()
  );
  return { templateFileId, targetFolderId, automationEnabled };
}

const latestStatusProjectionStages = [
  {
    $addFields: {
      latestStatus: {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$Status", []] } }, 0] },
          { $arrayElemAt: ["$Status", { $subtract: [{ $size: "$Status" }, 1] }] },
          null,
        ],
      },
    },
  },
  {
    $addFields: {
      latestTaskLower: {
        $toLower: { $trim: { input: { $ifNull: ["$latestStatus.Task", ""] } } },
      },
      hasBillable: {
        $anyElementTrue: {
          $map: {
            input: { $ifNull: ["$Items", []] },
            as: "it",
            in: { $gt: [{ $toDouble: { $ifNull: ["$$it.Amount", 0] } }, 0] },
          },
        },
      },
    },
  },
];

module.exports = {
  DEFAULT_ORDER_ASSIGNEE, OFFICE_USER_GROUP,
  resolveAssignableUser, resolveDefaultOfficeAssignee, resolveOfficeAssignee,
  resolveVendorMasterFromPayload, normalizeVendorAssignments,
  pushStatusOnly, nextCounterValue, syncVendorJobsForOrder,
  enrichOrderItemsAndBuildWorkRows, resolveDrivePayloadConfig,
  latestStatusProjectionStages,
};
