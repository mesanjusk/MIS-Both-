const mongoose = require('mongoose');

// A *responsibility area* — "Customer Enquiry", "Vendor Pickup" — and the
// user-level ownership chain configured for it.
//
// Why this is a new collection rather than an extension of an existing one:
//   - SOPTask is a recurring checklist *item* with a per-day completion record;
//     its ownership is by User_group, and several SOP items share one
//     responsibility area. It links here via `responsibility_uuid` instead.
//   - Usertasks is a task *instance* (one row per piece of work), not standing
//     configuration; instances point here so the chain survives task churn.
//   - Users can't hold it either: a responsibility is owned by three different
//     users at once, so storing it on any one of them loses the relationship.
//
// Ownership is stored as User_uuid values, never as a priority code: P2 is
// metadata on a user and can move to a different person tomorrow, so
// "Primary = P2" would silently re-point every responsibility on re-assignment.
const ResponsibilitySchema = new mongoose.Schema(
  {
    responsibility_uuid: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // Drives the Outside-logistics / inside-store split: a user marked Outside
    // stays available for `outside_logistics` work and steps aside only for
    // `inside_store` work, so a delivery run never blocks the store floor.
    category: {
      type: String,
      enum: ['outside_logistics', 'inside_store', 'customer', 'design', 'production', 'marketing', 'accounts', 'general'],
      default: 'general',
      index: true,
    },

    primaryUserUuid: { type: String, default: '' },
    backup1UserUuid: { type: String, default: '' },
    backup2UserUuid: { type: String, default: '' },

    // Critical responsibilities must have a primary and at least one backup —
    // enforced as a warning by the validation endpoint, not a hard save block,
    // so a half-configured chain is visible rather than un-saveable.
    isCritical: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'responsibilities' }
);

ResponsibilitySchema.index({ primaryUserUuid: 1 });
ResponsibilitySchema.index({ backup1UserUuid: 1 });
ResponsibilitySchema.index({ backup2UserUuid: 1 });
ResponsibilitySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Responsibility', ResponsibilitySchema);
