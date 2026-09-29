const mongoose = require('mongoose');

const sopHandoverSchema = new mongoose.Schema({
  sop_uuid: { type: String, required: true },
  employee_uuid: { type: String, required: true },
  date: { type: Date, required: true },
  kind: { type: String, enum: ['blocked', 'handover', 'emergency'], required: true },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  assignedTo: { type: String, default: 'Manager', trim: true },
  createdBy: { type: String, default: '' },
  reviewStatus: { type: String, enum: ['pending', 'reviewed'], default: 'pending' },
}, { timestamps: true });

// Exception records are employee-specific: a colleague's handover never
// silently completes another employee's mandatory responsibility.
sopHandoverSchema.index({ employee_uuid: 1, date: 1, sop_uuid: 1 }, { unique: true });
sopHandoverSchema.index({ date: 1, reviewStatus: 1 });
module.exports = mongoose.model('SOPHandover', sopHandoverSchema);
