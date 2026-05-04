const mongoose = require('mongoose');

const templateStepSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    label: { type: String, required: true },
    stage: {
      type: String,
      enum: ['enquiry', 'quoted', 'approved', 'design', 'printing', 'post_printing', 'finishing', 'ready', 'delivered', 'paid'],
      required: true,
    },
    autoAssignGroup: { type: String, default: null },
    requiresVendor: { type: Boolean, default: false },
    vendorWorkType: { type: String, default: null },
    preferredVendorUuid: { type: String, default: null },
    isOptional: { type: Boolean, default: false },
  },
  { _id: true }
);

const itemWorkflowTemplateSchema = new mongoose.Schema(
  {
    template_uuid: { type: String, required: true, unique: true, index: true },
    itemNamePattern: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    steps: { type: [templateStepSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String, default: 'system' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ItemWorkflowTemplate', itemWorkflowTemplateSchema, 'itemworkflowtemplates');
