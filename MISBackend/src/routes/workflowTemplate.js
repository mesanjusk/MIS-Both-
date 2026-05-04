const express = require('express');
const { v4: uuid } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const ItemWorkflowTemplate = require('../repositories/itemWorkflowTemplate');
const { applyWorkflowToOrder, completeWorkflowStep } = require('../services/workflowTemplateService');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

// List all templates
router.get('/', async (req, res) => {
  try {
    const templates = await ItemWorkflowTemplate.find().sort({ itemNamePattern: 1 }).lean();
    res.json({ success: true, result: templates });
  } catch (err) {
    logger.error('workflowTemplate list error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single template
router.get('/:id', async (req, res) => {
  try {
    const template = await ItemWorkflowTemplate.findOne({
      $or: [{ template_uuid: req.params.id }, { _id: mongoose.isValidObjectId(req.params.id) ? req.params.id : undefined }],
    }).lean();
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, result: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create template
router.post('/', async (req, res) => {
  try {
    const { itemNamePattern, description, steps = [], isActive = true } = req.body;
    if (!itemNamePattern) return res.status(400).json({ success: false, message: 'itemNamePattern is required' });

    const template = await ItemWorkflowTemplate.create({
      template_uuid: uuid(),
      itemNamePattern: String(itemNamePattern).trim(),
      description: String(description || '').trim(),
      steps: (steps || []).map((s, i) => ({
        order: Number(s.order ?? i + 1),
        label: String(s.label || '').trim(),
        stage: s.stage || null,
        autoAssignGroup: s.autoAssignGroup || null,
        requiresVendor: !!s.requiresVendor,
        vendorWorkType: s.vendorWorkType || null,
        preferredVendorUuid: s.preferredVendorUuid || null,
        isOptional: !!s.isOptional,
      })),
      isActive,
      createdBy: req.user?.userName || 'system',
    });
    res.status(201).json({ success: true, result: template });
  } catch (err) {
    logger.error('workflowTemplate create error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update template
router.put('/:id', async (req, res) => {
  try {
    const { itemNamePattern, description, steps, isActive } = req.body;
    const update = {};
    if (itemNamePattern !== undefined) update.itemNamePattern = String(itemNamePattern).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (isActive !== undefined) update.isActive = !!isActive;
    if (Array.isArray(steps)) {
      update.steps = steps.map((s, i) => ({
        order: Number(s.order ?? i + 1),
        label: String(s.label || '').trim(),
        stage: s.stage || null,
        autoAssignGroup: s.autoAssignGroup || null,
        requiresVendor: !!s.requiresVendor,
        vendorWorkType: s.vendorWorkType || null,
        preferredVendorUuid: s.preferredVendorUuid || null,
        isOptional: !!s.isOptional,
      }));
    }

    const template = await ItemWorkflowTemplate.findOneAndUpdate(
      { template_uuid: req.params.id },
      { $set: update },
      { new: true }
    ).lean();
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, result: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    await ItemWorkflowTemplate.deleteOne({ template_uuid: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Manually apply a template to an order (by item names)
router.post('/apply', async (req, res) => {
  try {
    const { orderUuid, itemNames = [] } = req.body;
    if (!orderUuid) return res.status(400).json({ success: false, message: 'orderUuid is required' });
    const result = await applyWorkflowToOrder(orderUuid, itemNames);
    if (!result) return res.status(404).json({ success: false, message: 'No matching template or order not found' });
    res.json({ success: true, result });
  } catch (err) {
    logger.error('workflowTemplate apply error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mark a workflow step as done → auto-advance
router.patch('/orders/:orderUuid/steps/:stepId/done', async (req, res) => {
  try {
    const { orderUuid, stepId } = req.params;
    const result = await completeWorkflowStep(orderUuid, stepId);
    res.json({ success: true, result });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

module.exports = router;
