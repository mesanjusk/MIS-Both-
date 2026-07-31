const mongoose = require('mongoose');
const { ORDER_STAGES } = require('../constants/orderStages');

// Template steps never target the terminal 'lost'/'cancelled' exits, so
// exclude them rather than duplicating the stage list by hand.
const TEMPLATE_TARGET_STAGES = ORDER_STAGES.filter((s) => s !== 'lost' && s !== 'cancelled');

const templateStepSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    label: { type: String, required: true },
    stage: {
      type: String,
      enum: TEMPLATE_TARGET_STAGES,
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
