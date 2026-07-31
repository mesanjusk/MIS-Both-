"use strict";
/**
 * Single writer for every vendor job — print or post-print — regardless of
 * where it's created from (order-page vendor assignment, PostPrintingControl's
 * "Assign Contractor", PostPrintingJob's "Add Job" form, or the Google Drive
 * design-files print-job flow). Consolidates what used to be three
 * hand-duplicated ProductionJob/VendorLedger write blocks (see
 * AUDIT_ORDER_PROCESSING_2026-07-31.md) into one function so `job_category`
 * is always set correctly and every job shows up in every vendor report.
 */
const { v4: uuid } = require("uuid");
const ProductionJob = require("../repositories/productionJob");
const VendorLedger = require("../repositories/vendorLedger");
const VendorMaster = require("../repositories/vendorMaster");
const Counter = require("../repositories/counter");
const { mapVendorJobType } = require("../utils/orderHelpers");
const { postVendorBill } = require("./accountingPostingService");
const logger = require("../utils/logger");

const JOB_CATEGORIES = ["general", "post_printing", "printing"];
const JOB_MODES = ["jobwork_only", "vendor_with_material", "own_material_sent", "mixed"];

async function nextProductionJobNumber() {
  const id = "production_job_number";
  const current = await Counter.findById(id).lean();
  if (!current?.seq) {
    await Counter.updateOne({ _id: id }, { $max: { seq: 0 } }, { upsert: true });
  }
  const updated = await Counter.findByIdAndUpdate(
    id, { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(updated?.seq || 1);
}

async function resolveVendor({ vendorUuid, vendorName, jobMode } = {}) {
  const uuidClean = String(vendorUuid || "").trim();
  const nameClean = String(vendorName || "").trim();
  if (uuidClean) {
    const existing = await VendorMaster.findOne({ Vendor_uuid: uuidClean });
    if (existing) return existing;
  }
  if (nameClean) {
    const byName = await VendorMaster.findOne({ Vendor_name: nameClean });
    if (byName) return byName;
  }
  if (!nameClean) {
    const error = new Error("Vendor name or vendor id is required");
    error.statusCode = 400;
    throw error;
  }
  return VendorMaster.create({
    Vendor_uuid: uuidClean || uuid(),
    Vendor_name: nameClean,
    Vendor_type: jobMode === "vendor_with_material" ? "mixed" : "jobwork",
    Active: true,
    Jobwork_capable: true,
    Raw_material_capable: jobMode === "vendor_with_material",
  });
}

function buildLinkedOrders({ linkedOrders, orderUuid, orderNumber, orderItemLineId, qty, amount }) {
  if (Array.isArray(linkedOrders) && linkedOrders.length) return linkedOrders;
  if (!orderUuid) return [];
  return [{
    orderUuid,
    orderNumber: orderNumber ?? null,
    orderItemLineId: orderItemLineId || "",
    quantity: Number(qty || 0),
    outputQuantity: Number(qty || 0),
    costShareAmount: Number(amount || 0),
    allocationBasis: "manual",
  }];
}

function buildQtyItems(explicitItems, singleName, singleType, qty) {
  if (Array.isArray(explicitItems) && explicitItems.length) return explicitItems;
  if (!singleName) return [];
  return [{ itemName: singleName, itemType: singleType, quantity: Number(qty || 0), amount: 0 }];
}

/**
 * Find-or-create identity: a job is uniquely identified by the pairing of
 * (orderUuid, orderItemLineId) inside linkedOrders — the same rule
 * `syncVendorJobsForOrder` already used for order-vendor-assignment sync,
 * now shared by every caller. Pass jobUuid instead to target a specific job
 * directly (e.g. filling in vendor/amount on an existing draft print job).
 */
async function findExistingJob({ jobUuid, orderUuid, orderItemLineId }) {
  if (jobUuid) return ProductionJob.findOne({ job_uuid: jobUuid }).lean();
  if (orderUuid && orderItemLineId) {
    return ProductionJob.findOne({
      "linkedOrders.orderUuid": orderUuid,
      "linkedOrders.orderItemLineId": orderItemLineId,
    }).lean();
  }
  return null;
}

/**
 * `upsertVendorJob` doubles as a *partial* update when it targets an existing
 * job (e.g. `update-print-job` only patches vendor/amount/notes on a draft
 * print job) — so any field the caller didn't pass falls back to the
 * existing job's current value, never to a blank default that would wipe it.
 */
async function upsertVendorJob(input = {}) {
  const {
    jobCategory,
    jobUuid,
    orderUuid = "", orderNumber = null, orderItemLineId = "",
    vendorUuid, vendorName,
    workType, jobType,
    jobMode,
    qty = 0, amount, advanceAmount, materialValue,
    otherCharges,
    inputItem, outputItem, inputItems, outputItems,
    linkedOrders,
    dueDate, expectedCompletion,
    status,
    notes,
    createdBy,
    driveFileId,
    postAccountingBill = false,
    referenceType = "vendor_job",
  } = input;

  if (!JOB_CATEGORIES.includes(jobCategory)) {
    throw new Error(`upsertVendorJob: jobCategory is required and must be one of ${JOB_CATEGORIES.join(", ")}`);
  }

  const existing = await findExistingJob({ jobUuid, orderUuid, orderItemLineId });

  const resolvedJobMode = jobMode != null
    ? (JOB_MODES.includes(jobMode) ? jobMode : "jobwork_only")
    : (existing?.job_mode || "jobwork_only");

  const vendor = await resolveVendor({
    vendorUuid: vendorUuid ?? existing?.vendor_uuid,
    vendorName: vendorName ?? existing?.vendor_name,
    jobMode: resolvedJobMode,
  });

  const cleanAmount = amount != null ? Number(amount) || 0 : Number(existing?.jobValue || 0);
  const cleanAdvance = advanceAmount != null ? Number(advanceAmount) || 0 : Number(existing?.advanceAmount || 0);
  const resolvedMaterialValue = materialValue != null
    ? Number(materialValue) || 0
    : existing ? Number(existing.materialValue || 0)
    : resolvedJobMode === "vendor_with_material" ? cleanAmount : 0;

  const linkedOrdersDoc = (Array.isArray(linkedOrders) && linkedOrders.length) || orderUuid
    ? buildLinkedOrders({ linkedOrders, orderUuid, orderNumber, orderItemLineId, qty, amount: cleanAmount })
    : (existing?.linkedOrders || []);
  const inputItemsDoc = (Array.isArray(inputItems) && inputItems.length) || inputItem
    ? buildQtyItems(inputItems, inputItem, "raw", qty)
    : (existing?.inputItems || []);
  const outputItemsDoc = (Array.isArray(outputItems) && outputItems.length) || outputItem
    ? buildQtyItems(outputItems, outputItem, "semi_finished", qty)
    : (existing?.outputItems || []);
  const resolvedJobType = jobType || (workType ? mapVendorJobType(workType) : (existing?.job_type || "manual"));

  const fields = {
    job_category: jobCategory,
    job_type: resolvedJobType,
    job_mode: resolvedJobMode,
    vendor_uuid: vendor.Vendor_uuid,
    vendor_name: vendor.Vendor_name,
    job_date: dueDate || existing?.job_date || new Date(),
    expected_completion: expectedCompletion !== undefined ? expectedCompletion : (existing?.expected_completion ?? null),
    status: status || existing?.status || "draft",
    inputItems: inputItemsDoc,
    outputItems: outputItemsDoc,
    linkedOrders: linkedOrdersDoc,
    advanceAmount: cleanAdvance,
    jobValue: cleanAmount,
    materialValue: resolvedMaterialValue,
    otherCharges: otherCharges != null ? Number(otherCharges) || 0 : Number(existing?.otherCharges || 0),
    notes: notes !== undefined ? notes : (existing?.notes || ""),
    createdBy: createdBy || existing?.createdBy || "system",
    driveFileId: driveFileId !== undefined ? driveFileId : (existing?.driveFileId || ""),
  };
  if (linkedOrdersDoc[0]) {
    fields.order_uuid = linkedOrdersDoc[0].orderUuid;
    fields.order_number = linkedOrdersDoc[0].orderNumber;
  }

  let job;
  if (existing) {
    job = await ProductionJob.findByIdAndUpdate(existing._id, { $set: fields }, { new: true }).lean();
  } else {
    const jobNumber = await nextProductionJobNumber();
    const created = await ProductionJob.create({ job_uuid: uuid(), job_number: jobNumber, ...fields });
    job = created.toObject ? created.toObject() : created;
  }

  // job.job_uuid is already a stable, unique identity for this job across
  // create and every subsequent update — using it as the ledger key (rather
  // than orderItemLineId/driveFileId, which aren't always passed on updates)
  // means the same bill/advance row is found and patched every time, even
  // when the vendor on the job changes (e.g. suspense vendor -> real vendor).
  const ledgerKey = job.job_uuid;
  const billReferenceType = `${referenceType}_bill`;
  const advanceReferenceType = `${referenceType}_advance`;
  const ledgerFilterBase = { reference_type: billReferenceType, reference_id: ledgerKey };
  const ledgerAdvanceFilterBase = { reference_type: advanceReferenceType, reference_id: ledgerKey };

  if (cleanAmount > 0) {
    await VendorLedger.findOneAndUpdate(
      ledgerFilterBase,
      {
        $set: {
          vendor_uuid: vendor.Vendor_uuid,
          vendor_name: vendor.Vendor_name,
          date: dueDate || new Date(),
          entry_type: resolvedJobMode === "vendor_with_material" ? "material_bill" : "job_bill",
          job_uuid: job.job_uuid,
          order_uuid: linkedOrdersDoc[0]?.orderUuid || "",
          order_number: linkedOrdersDoc[0]?.orderNumber ?? null,
          amount: cleanAmount,
          dr_cr: "cr",
          narration: notes || `${workType || resolvedJobType} job${linkedOrdersDoc[0]?.orderNumber ? ` for order #${linkedOrdersDoc[0].orderNumber}` : ""}`,
        },
        $setOnInsert: ledgerFilterBase,
      },
      { upsert: true, new: true }
    );
  }

  if (cleanAdvance > 0) {
    await VendorLedger.findOneAndUpdate(
      ledgerAdvanceFilterBase,
      {
        $set: {
          vendor_uuid: vendor.Vendor_uuid,
          vendor_name: vendor.Vendor_name,
          date: new Date(),
          entry_type: "advance_paid",
          job_uuid: job.job_uuid,
          order_uuid: linkedOrdersDoc[0]?.orderUuid || "",
          order_number: linkedOrdersDoc[0]?.orderNumber ?? null,
          amount: cleanAdvance,
          dr_cr: "dr",
          narration: `Advance paid for ${workType || resolvedJobType}${linkedOrdersDoc[0]?.orderNumber ? ` on order #${linkedOrdersDoc[0].orderNumber}` : ""}`,
        },
        $setOnInsert: ledgerAdvanceFilterBase,
      },
      { upsert: true, new: true }
    );
  } else {
    await VendorLedger.deleteMany(ledgerAdvanceFilterBase);
  }

  let accountingPosting = null;
  if (postAccountingBill && cleanAmount > 0) {
    // Non-fatal: the VendorLedger row above is the record of the bill; a
    // failure to also mirror it into the general accounting ledger shouldn't
    // block the vendor-job save itself.
    try {
      accountingPosting = await postVendorBill({
        amount: cleanAmount,
        orderUuid: linkedOrdersDoc[0]?.orderUuid || null,
        orderNumber: linkedOrdersDoc[0]?.orderNumber || null,
        createdBy,
        partyName: vendor.Vendor_name,
        narration: notes || workType || resolvedJobType,
        sourceSuffix: ledgerKey,
      });
    } catch (acctErr) {
      logger.warn({ acctErr }, "vendorJobService: accounting post failed (non-fatal)");
    }
  }

  return { job, vendor, accountingPosting };
}

/**
 * Deletes any ProductionJob (and its ledger rows) linked to `orderUuid`
 * that wasn't touched in this round — i.e. its assignment was removed from
 * the order. Extracted from the old _shared.js stale-cleanup logic; ledger
 * rows are now keyed by job_uuid (see upsertVendorJob's `ledgerKey`), so the
 * cleanup matches on that instead of the old assignmentId-based reference_id.
 */
async function deleteStaleVendorJobs(orderUuid, touchedJobIds = []) {
  if (!orderUuid) return;
  const existingJobs = await ProductionJob.find({ "linkedOrders.orderUuid": orderUuid }).lean();
  const touchedSet = new Set(touchedJobIds.map(String));
  const staleJobs = existingJobs.filter((job) => !touchedSet.has(String(job._id)));
  if (!staleJobs.length) return;

  await ProductionJob.deleteMany({ _id: { $in: staleJobs.map((j) => j._id) } });
  const staleJobUuids = staleJobs.map((job) => job.job_uuid).filter(Boolean);
  if (staleJobUuids.length) {
    await VendorLedger.deleteMany({
      order_uuid: orderUuid,
      reference_id: { $in: staleJobUuids },
    });
  }
}

module.exports = {
  JOB_CATEGORIES,
  upsertVendorJob,
  deleteStaleVendorJobs,
  resolveVendor,
  nextProductionJobNumber,
};
