"use strict";
const express = require("express");
const router = express.Router();
const { v4: uuid } = require("uuid");
const Orders = require("../../repositories/order");
const Counter = require("../../repositories/counter");
const Customers = require("../../repositories/customer");
const {
  copyOrderTemplateFileOAuth,
  isGoogleAuthError,
} = require("../../services/googleDriveOAuthService");
const GoogleDriveToken = require("../../repositories/googleDriveToken");
const { autoCreateDesignerTask } = require("../../services/orderLifecycleService");
const { applyWorkflowToOrder } = require("../../services/workflowTemplateService");
const { buildDefaultDueDate } = require("../../services/orderTaskService");
const logger = require("../../utils/logger");
const { norm, toDate, normalizeItems, normalizeSteps } = require("../../utils/orderHelpers");
const {
  DEFAULT_ORDER_ASSIGNEE,
  resolveAssignableUser,
  resolveOfficeAssignee,
  normalizeVendorAssignments,
  enrichOrderItemsAndBuildWorkRows,
  syncVendorJobsForOrder,
  resolveDrivePayloadConfig,
} = require("./_shared");

/* ----------------------- CREATE NEW ORDER ----------------------- */
router.post("/addOrder", async (req, res) => {
  try {
    const {
      Customer_uuid,
      Status = [{}],
      Steps = [],
      Items = [],
      orderMode,
      orderNote,
      vendorAssignments = [],
      Type,
      isEnquiry,
      stage = "enquiry",
      priority = "medium",
      dueDate = null,
      assignedTo = null,
      assignToUserUuid = null,
      assignToUserId = null,
      productionStepsEnabled,
    } = req.body;

    if (!Customer_uuid) {
      return res.status(400).json({ success: false, message: "Customer_uuid is required" });
    }

    const rawType = typeof Type === "string" ? Type.trim().toLowerCase() : "";
    const isEnquiryOnly =
      (typeof isEnquiry === "boolean" && isEnquiry) ||
      rawType === "enquiry" ||
      rawType === "inquiry" ||
      rawType.includes("enquiry") ||
      rawType.includes("inquiry");

    const now = new Date();
    const effectiveDueDate = dueDate ? new Date(dueDate) : (!isEnquiryOnly ? buildDefaultDueDate() : null);
    const requestedAssignee = assignedTo || assignToUserUuid || assignToUserId || DEFAULT_ORDER_ASSIGNEE;
    const assignedUserForOrder = !isEnquiryOnly
      ? await resolveOfficeAssignee(requestedAssignee, { fallbackToDefault: true })
      : await resolveAssignableUser(requestedAssignee);
    const assignedDisplayName = assignedUserForOrder?.User_name || (!isEnquiryOnly ? DEFAULT_ORDER_ASSIGNEE : "None");

    const statusDefaults = {
      Task: isEnquiryOnly ? "Enquiry" : "Design",
      Assigned: assignedDisplayName,
      Status_number: 1,
      Delivery_Date: effectiveDueDate || now,
      CreatedAt: now,
    };

    const updatedStatus = (Status || []).map((s) => ({
      ...statusDefaults,
      ...s,
      Delivery_Date: toDate(s?.Delivery_Date, now),
      CreatedAt: toDate(s?.CreatedAt, now),
    }));

    if (!updatedStatus[0]?.Task || !updatedStatus[0]?.Assigned || !updatedStatus[0]?.Delivery_Date) {
      return res.status(400).json({
        success: false,
        message: "Task, Assigned, and Delivery_Date are required in Status[0].",
      });
    }

    const flatSteps = productionStepsEnabled === false ? [] : normalizeSteps(Steps);
    const normalizedVendorAssignments = await normalizeVendorAssignments(vendorAssignments);
    const requestedOrderMode = String(orderMode || "").trim().toLowerCase();
    const finalOrderMode = requestedOrderMode === "items" ? "items" : "note";
    const normalizedOrderNote = norm(
      orderNote || req.body?.Remark || req.body?.remark || req.body?.note || req.body?.comments || req.body?.description
    );
    const lineItems = normalizeItems(Items);
    const { enrichedItems, workRows } = await enrichOrderItemsAndBuildWorkRows(lineItems, effectiveDueDate);

    const topRemark = normalizedOrderNote;

    if (finalOrderMode === "note" && lineItems.length === 0 && String(topRemark).trim()) {
      lineItems.push({
        Item: "Order Note",
        Quantity: 0,
        Rate: 0,
        Amount: 0,
        Priority: "Normal",
        Remark: String(topRemark).trim(),
      });
    }

    const currentCounter = await Counter.findById("order_number").lean();
    if (!currentCounter?.seq) {
      const lastOrder = await Orders.findOne({}, { Order_Number: 1 })
        .sort({ Order_Number: -1 })
        .lean();
      const seedValue = Number(lastOrder?.Order_Number || 0);
      await Counter.updateOne({ _id: "order_number" }, { $max: { seq: seedValue } }, { upsert: true });
    }

    const counter = await Counter.findByIdAndUpdate(
      "order_number",
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const newOrderNumber = Number(counter?.seq || 1);

    const newOrder = new Orders({
      Order_uuid: uuid(),
      Order_Number: newOrderNumber,
      Customer_uuid,
      Status: updatedStatus,
      orderMode: finalOrderMode,
      Remark: normalizedOrderNote,
      orderNote: normalizedOrderNote,
      vendorAssignments: normalizedVendorAssignments,
      Steps: flatSteps,
      Items: enrichedItems,
      workRows,
      stage: String(stage || (isEnquiryOnly ? "enquiry" : "design")).toLowerCase(),
      stageHistory: [
        { stage: String(stage || (isEnquiryOnly ? "enquiry" : "design")).toLowerCase(), timestamp: new Date() },
      ],
      priority: ["low", "medium", "high"].includes(String(priority || "").toLowerCase())
        ? String(priority).toLowerCase()
        : "medium",
      dueDate: effectiveDueDate || null,
      assignedTo: assignedUserForOrder?._id || null,
      driveFile: { status: "pending" },
    });

    await newOrder.save();

    if (String(newOrder.stage || "").toLowerCase() === "design") {
      await autoCreateDesignerTask(newOrder);
    }

    const itemNamesForTemplate = (enrichedItems || []).map((i) => i.Item).filter(Boolean);
    if (itemNamesForTemplate.length) {
      try {
        await applyWorkflowToOrder(newOrder.Order_uuid, itemNamesForTemplate);
      } catch (templateErr) {
        logger.error("workflow template apply failed (non-fatal):", templateErr.message);
      }
    }

    let vendorJobs = [];
    if (Array.isArray(newOrder.vendorAssignments) && newOrder.vendorAssignments.length) {
      vendorJobs = await syncVendorJobsForOrder(
        newOrder,
        newOrder.vendorAssignments,
        req.body?.createdBy || req.user?.userName || "system"
      );
    }

    const driveConfig = resolveDrivePayloadConfig(req.body || {});

    let driveFile = {
      status: "skipped",
      templateFileId: driveConfig.templateFileId || null,
      folderId: driveConfig.targetFolderId || null,
      error: null,
    };

    let driveWarning = null;

    try {
      if (driveConfig.automationEnabled && !isEnquiryOnly) {
        if (!driveConfig.templateFileId) {
          throw new Error("Drive template file is not configured");
        }
        const customer = await Customers.findOne({ Customer_uuid }).lean();
        if (!customer) {
          throw new Error("Customer not found for drive file copy");
        }
        const finalDescription =
          String(topRemark || "").trim() ||
          (lineItems?.[0]?.Remark || "").trim() ||
          "Work";
        const copiedFile = await copyOrderTemplateFileOAuth({
          templateFileId: driveConfig.templateFileId,
          targetFolderId: driveConfig.targetFolderId,
          orderNumber: newOrderNumber,
          customerName: customer.Customer_name || "Customer",
          description: finalDescription,
          mobileNumber: customer.Mobile_number || "",
        });
        driveFile = {
          status: "created",
          templateFileId: driveConfig.templateFileId || null,
          fileId: copiedFile.id || null,
          folderId: driveConfig.targetFolderId || null,
          name: copiedFile.name || null,
          description: copiedFile.description || finalDescription,
          webViewLink: copiedFile.webViewLink || null,
          webContentLink: copiedFile.webContentLink || null,
          error: null,
          createdAt: new Date(),
        };
      }
    } catch (driveErr) {
      logger.error("Google Drive copy error:", driveErr);
      const reconnectRequired = Boolean(driveErr?.reconnectRequired) || isGoogleAuthError(driveErr);
      if (reconnectRequired) {
        await GoogleDriveToken.deleteMany({ provider: "google_drive" });
      }
      driveFile = {
        status: "failed",
        templateFileId: driveConfig.templateFileId || null,
        folderId: driveConfig.targetFolderId || null,
        error: reconnectRequired
          ? "Google Drive disconnected. Please reconnect Google Drive."
          : driveErr.message || "Unknown drive error",
        reconnectRequired,
        createdAt: null,
      };
      driveWarning = driveFile.error || "Drive copy failed";
    }

    await Orders.updateOne({ _id: newOrder._id }, { $set: { driveFile } });

    const savedOrder = await Orders.findById(newOrder._id).lean();

    return res.json({
      success: true,
      message: isEnquiryOnly
        ? "Enquiry added successfully"
        : driveFile.status === "created"
        ? "Order added successfully and Drive file created"
        : "Order added successfully",
      orderId: newOrder._id,
      orderNumber: newOrderNumber,
      result: savedOrder,
      vendorJobs,
      driveFile,
      warning: driveWarning,
    });
  } catch (error) {
    logger.error("Error saving order:", error);
    return res.status(500).json({ success: false, message: "Failed to add order", error: error.message });
  }
});

module.exports = router;
