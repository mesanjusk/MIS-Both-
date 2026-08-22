const mongoose = require('mongoose');

/**
 * Endpoints and pages an admin has switched off.
 *
 * This is the alternative to commenting code out. Commented code needs a
 * developer, a commit and a deploy to bring back, which is the opposite of
 * "activate it again from the front end" — and it is deleted from the running
 * server the moment it ships, so a mistake is an outage until someone is free
 * to fix it. A row here is reversible by unticking a box.
 *
 * A row exists only for something that has been *touched*. Absence means
 * enabled, so the default for all 310 endpoints and 79 pages is "on" and no
 * migration is needed to keep the app working exactly as it does today.
 */
const FeatureToggleSchema = new mongoose.Schema(
  {
    // 'GET /api/orders/:id' for an api, or a route path like '/reports/team'
    // for a page. Same key shape the usage collection uses, so they join.
    key: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ['api', 'page'], required: true, index: true },

    disabled: { type: Boolean, default: false, index: true },
    disabledAt: { type: Date, default: null },
    // Who turned it off, so a surprise 410 three months from now has a name
    // attached to it rather than being a mystery.
    disabledBy: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true, collection: 'feature_toggles' }
);

module.exports = mongoose.model('FeatureToggle', FeatureToggleSchema);
