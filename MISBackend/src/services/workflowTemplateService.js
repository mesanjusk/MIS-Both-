const { v4: uuid } = require('uuid');
const mongoose = require('mongoose');
const ItemWorkflowTemplate = require('../repositories/itemWorkflowTemplate');
const Orders = require('../repositories/order');
const Users = require('../repositories/users');
const Usertasks = require('../repositories/usertask');
const VendorMaster = require('../repositories/vendorMaster');
const logger = require('../utils/logger');

const VALID_STAGES = ['enquiry', 'quoted', 'approved', 'design', 'printing', 'post_printing', 'finishing', 'ready', 'delivered', 'paid'];

function normalizeItemName(name) {
  return String(name || '').trim().toLowerCase();
}

function resolveOrderFilter(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return { _id: id };
  if (/^\d+$/.test(id)) return { Order_Number: Number(id) };
  return { Order_uuid: id };
}

async function findMatchingTemplates(itemNames) {
  const templates = await ItemWorkflowTemplate.find({ isActive: true }).lean();
  const matched = new Map();

  for (const itemName of itemNames) {
    const normalized = normalizeItemName(itemName);
    if (!normalized) continue;
    for (const template of templates) {
      const pattern = normalizeItemName(template.itemNamePattern);
      if (!pattern) continue;
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        if (!matched.has(template.template_uuid)) {
          matched.set(template.template_uuid, template);
        }
      }
    }
  }

  return [...matched.values()];
}

function mergeTemplateSteps(templates) {
  const seen = new Map();
  for (const template of templates) {
    for (const step of (template.steps || [])) {
      const key = normalizeItemName(step.label);
      if (!seen.has(key)) {
        seen.set(key, { ...step, templateRef: template.template_uuid });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.order - b.order);
}

async function autoAssignStep(step, order) {
  if (!step.autoAssignGroup) return null;
  try {
    const users = await Users.find({
      $or: [
        { User_group: new RegExp(step.autoAssignGroup, 'i') },
        { Role: new RegExp(step.autoAssignGroup, 'i') },
      ],
    }).sort({ createdAt: 1 }).lean();

    if (!users.length) return null;
    const assignee = users[0];

    const orderNumber = order.Order_Number || '';
    const customerName = order.Customer_name || order.customerName || '';
    const taskName = `${step.label} for Order #${orderNumber} — ${customerName}`.trim();

    const duplicate = await Usertasks.findOne({ Usertask_name: taskName, Status: { $in: ['Pending', 'pending'] } }).lean();
    if (duplicate) return assignee.User_name;

    const last = await Usertasks.findOne().sort({ Usertask_Number: -1 }).lean();
    const now = new Date();
    await Usertasks.create({
      Usertask_uuid: uuid(),
      Usertask_Number: Number(last?.Usertask_Number || 0) + 1,
      User: assignee.User_name,
      Usertask_name: taskName,
      Date: now,
      Time: now.toLocaleTimeString('en-US', { hour12: false }),
      Deadline: order.dueDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      Remark: `Auto-assigned from workflow template. Order UUID: ${order.Order_uuid || order._id}`,
      Status: 'Pending',
    });
    return assignee.User_name;
  } catch (err) {
    logger.error('workflowTemplateService autoAssignStep failed:', err.message);
    return null;
  }
}

async function resolvePreferredVendor(preferredVendorUuid) {
  if (!preferredVendorUuid) return null;
  return VendorMaster.findOne({ Vendor_uuid: preferredVendorUuid }).lean();
}

async function applyWorkflowToOrder(orderIdOrUuid, itemNames = []) {
  if (!itemNames.length) return null;
  const filter = resolveOrderFilter(orderIdOrUuid);
  if (!filter) return null;

  const order = await Orders.findOne(filter);
  if (!order) return null;

  const templates = await findMatchingTemplates(itemNames);
  if (!templates.length) return null;

  const mergedSteps = mergeTemplateSteps(templates);
  if (!mergedSteps.length) return null;

  const existingLabels = new Set((order.workflowSteps || []).map((s) => normalizeItemName(s.label)));
  const newSteps = mergedSteps.filter((s) => !existingLabels.has(normalizeItemName(s.label)));
  if (!newSteps.length) return order;

  const builtSteps = newSteps.map((s, idx) => ({
    stepId: uuid(),
    templateRef: s.templateRef,
    order: s.order ?? (idx + 1),
    label: s.label,
    stage: s.stage || null,
    autoAssignGroup: s.autoAssignGroup || null,
    requiresVendor: !!s.requiresVendor,
    vendorWorkType: s.vendorWorkType || null,
    preferredVendorUuid: s.preferredVendorUuid || null,
    assignedTo: null,
    vendorId: null,
    vendorName: null,
    status: 'pending',
    startedAt: null,
    completedAt: null,
  }));

  order.workflowSteps = [...(order.workflowSteps || []), ...builtSteps];

  // Activate the first pending step
  const firstPending = order.workflowSteps.find((s) => s.status === 'pending');
  if (firstPending) {
    firstPending.status = 'active';
    firstPending.startedAt = new Date();

    // Auto-advance order stage if step defines one and it's ahead of current
    if (firstPending.stage) {
      const currentIdx = VALID_STAGES.indexOf(String(order.stage || 'enquiry').toLowerCase());
      const stepIdx = VALID_STAGES.indexOf(firstPending.stage);
      if (stepIdx > currentIdx) {
        order.stage = firstPending.stage;
        order.stageHistory = order.stageHistory || [];
        order.stageHistory.push({ stage: firstPending.stage, timestamp: new Date() });
      }
    }

    await order.save();

    // Auto-assign after save
    const assignedTo = await autoAssignStep(firstPending, order);
    if (assignedTo) {
      await Orders.updateOne(
        { _id: order._id, 'workflowSteps.stepId': firstPending.stepId },
        { $set: { 'workflowSteps.$.assignedTo': assignedTo } }
      );
    }

    // Auto-assign preferred vendor if set
    if (firstPending.requiresVendor && firstPending.preferredVendorUuid) {
      const vendor = await resolvePreferredVendor(firstPending.preferredVendorUuid);
      if (vendor) {
        await Orders.updateOne(
          { _id: order._id, 'workflowSteps.stepId': firstPending.stepId },
          { $set: { 'workflowSteps.$.vendorId': vendor.Vendor_uuid, 'workflowSteps.$.vendorName': vendor.Vendor_name } }
        );
      }
    }
  } else {
    await order.save();
  }

  return Orders.findById(order._id).lean();
}

async function completeWorkflowStep(orderIdOrUuid, stepId) {
  const filter = resolveOrderFilter(orderIdOrUuid);
  if (!filter) throw Object.assign(new Error('Order id required'), { statusCode: 400 });

  const order = await Orders.findOne(filter);
  if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });

  const steps = order.workflowSteps || [];
  const stepIdx = steps.findIndex((s) => s.stepId === stepId);
  if (stepIdx === -1) throw Object.assign(new Error('Workflow step not found'), { statusCode: 404 });

  const step = steps[stepIdx];
  if (step.status === 'done') return Orders.findById(order._id).lean();

  step.status = 'done';
  step.completedAt = new Date();

  // Find and activate the next pending step
  const nextStep = steps.slice(stepIdx + 1).find((s) => s.status === 'pending');
  if (nextStep) {
    nextStep.status = 'active';
    nextStep.startedAt = new Date();

    // Auto-advance stage
    if (nextStep.stage) {
      const currentIdx = VALID_STAGES.indexOf(String(order.stage || 'enquiry').toLowerCase());
      const stepStageIdx = VALID_STAGES.indexOf(nextStep.stage);
      if (stepStageIdx > currentIdx) {
        order.stage = nextStep.stage;
        order.stageHistory = order.stageHistory || [];
        order.stageHistory.push({ stage: nextStep.stage, timestamp: new Date() });
      }
    }
  }

  await order.save();

  // Auto-assign next step after save
  if (nextStep) {
    const assignedTo = await autoAssignStep(nextStep, order);
    if (assignedTo) {
      await Orders.updateOne(
        { _id: order._id, 'workflowSteps.stepId': nextStep.stepId },
        { $set: { 'workflowSteps.$.assignedTo': assignedTo } }
      );
    }

    if (nextStep.requiresVendor && nextStep.preferredVendorUuid) {
      const vendor = await resolvePreferredVendor(nextStep.preferredVendorUuid);
      if (vendor) {
        await Orders.updateOne(
          { _id: order._id, 'workflowSteps.stepId': nextStep.stepId },
          { $set: { 'workflowSteps.$.vendorId': vendor.Vendor_uuid, 'workflowSteps.$.vendorName': vendor.Vendor_name } }
        );
      }
    }
  }

  return Orders.findById(order._id).lean();
}

module.exports = { applyWorkflowToOrder, completeWorkflowStep, findMatchingTemplates };
