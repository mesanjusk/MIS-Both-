const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const vendorMasterSchema = new mongoose.Schema(
  {
    Vendor_uuid: { type: String, unique: true, index: true },
    Vendor_name: { type: String, required: true, trim: true, index: true },
    Mobile_number: { type: String, default: '' },
    Address: { type: String, default: '' },
    GST: { type: String, default: '' },
    Opening_balance: { type: Number, default: 0 },
    Opening_balance_type: { type: String, enum: ['payable', 'advance', 'none'], default: 'none' },
    Payment_terms: { type: String, default: '' },
    Email: { type: String, default: '', trim: true },
    Vendor_type: { type: String, enum: ['material', 'jobwork', 'mixed'], default: 'mixed' },
    Active: { type: Boolean, default: true },
    Notes: { type: String, default: '' },
    Raw_material_capable: { type: Boolean, default: false },
    Jobwork_capable: { type: Boolean, default: true },
    // How this external party is engaged — distinct from Vendor_type (what
    // work they do). Drives display badges on the assignment picker and lets
    // the same vendor_masters collection + billing ledger cover job-work
    // vendors, per-task freelancers, and contractors without three separate
    // tables.
    Engagement_type: { type: String, enum: ['vendor', 'freelancer', 'contractor'], default: 'vendor' },
    // Which pipeline stage(s) this party can be assigned work for. Empty = no
    // restriction (shows up on every stage's assign menu) so existing/untagged
    // records keep working exactly as before until someone tags them.
    Capabilities: { type: [String], enum: ['design', 'print', 'postprint', 'delivery'], default: [] },
  },
  { timestamps: true, collection: 'vendor_masters' }
);

vendorMasterSchema.index({ Active: 1 });
vendorMasterSchema.index({ Vendor_type: 1, Active: 1 });
vendorMasterSchema.index({ Engagement_type: 1, Active: 1 });

vendorMasterSchema.pre('validate', function(next) {
  if (!this.Vendor_uuid) this.Vendor_uuid = uuidv4();
  next();
});

module.exports = mongoose.model('VendorMaster', vendorMasterSchema);
