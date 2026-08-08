const mongoose = require('mongoose');

const UsergroupSchema=new mongoose.Schema({
    User_group_uuid: { type: String },
    User_group: { type: String, required: true },
    // Group-level defaults for what members of this group may do from the
    // WhatsApp order-management commands. Left unset ("not configured") on
    // purpose — when absent, permissionService falls back to a role-tier
    // default instead of locking every group out until an admin visits this
    // screen. Set any subset of these keys to override the default.
    modulePermissions: {
      type: {
        viewOrders: { type: Boolean },
        advanceOrderStage: { type: Boolean },
        assignOrders: { type: Boolean },
        createOrders: { type: Boolean },
        receivePayments: { type: Boolean },
        // Social Media module — left unset ("not configured") the same way
        // as the WhatsApp keys above; socialPermissionService falls back to
        // a role-tier default when a key is absent for this group.
        socialView: { type: Boolean },
        socialCreate: { type: Boolean },
        socialEdit: { type: Boolean },
        socialDelete: { type: Boolean },
        socialApprove: { type: Boolean },
        socialPublish: { type: Boolean },
        socialAccountsManage: { type: Boolean },
        socialAnalyticsView: { type: Boolean },
      },
      default: undefined,
    },
 })

// Index for faster retrieval
UsergroupSchema.index({ User_group: 1 });
UsergroupSchema.index({ User_group_uuid: 1 });

 const Usergroup = mongoose.model("Usergroup", UsergroupSchema);

module.exports = Usergroup;
