const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UsersSchema = new mongoose.Schema({
  User_uuid: { type: String },
  // Additive identity key. New users are protected immediately; historical
  // rows are backfilled only after the integrity migration proves uniqueness.
  User_identity_key: { type: String, default: undefined, select: false },
  employeeId: { type: String },
  name: { type: String },
  phone: { type: String, unique: true, sparse: true },
  User_name: { type: String, required: true },
  Password: { type: String, required: true },

  /**
   * Bumped whenever every existing session for this user must stop working:
   * a password change, a role change, or an administrative revoke. Tokens
   * carry the value they were issued with, and requireAuth refuses any token
   * whose value is behind the stored one. Without it a long-lived token outlives
   * a demotion or a password reset.
   */
  Session_version: { type: Number, default: 0 },

  // Short-lived, single-use OAuth state rows. Stored on the existing Users
  // collection so starting an OAuth flow never needs to create another Mongo
  // collection (production can be at the provider collection limit).
  // select:false prevents these internal nonces/redirects from leaking through
  // normal user API responses.
  OAuth_states: {
    type: [{
      nonce: { type: String, required: true },
      purpose: { type: String, required: true },
      user_name: { type: String, default: '' },
      return_to: { type: String, default: '' },
      meta: { type: mongoose.Schema.Types.Mixed, default: null },
      expires_at: { type: Date, required: true },
    }],
    default: [],
    select: false,
  },

  Mobile_number: { type: String, required: true, unique: true },
  User_group: { type: String, required: true },
  Amount: { type: Number, required: true },
  // Legacy field retained for compatibility. New code should prefer the
  // explicit Ledger_account_uuid field below.
  AccountID: { type: String },
  Ledger_account_uuid: { type: String, default: '' },
  lastCustomerMessageAt: { type: Date },
  Allowed_Task_Groups: {
    type: [String],
    default: [],
  },
  // Which pipeline stage(s) this employee normally works — same enum as
  // VendorMaster.Capabilities so both feed the same stage-filtered assign
  // menu. Empty = no restriction (shows on every stage) so existing users
  // keep appearing everywhere until an admin tags them.
  Capabilities: {
    type: [String],
    enum: ['design', 'print', 'postprint', 'delivery'],
    default: [],
  },
  // ── Operational configuration (Team Operations module) ───────────────────
  // Everything here is *configuration set from the frontend*, never hard-coded.
  // `priority` is a free-form code validated against the configurable priority
  // catalogue in AppSetting `operations_priority_levels` (defaults P1..P4), so
  // management can re-assign P1/P2/P3/P4 between users — or add a P5 — without
  // a code change. `roleTitle` is deliberately separate from `priority` and
  // from `User_group`: priority is the fallback ordering, roleTitle describes
  // what the person actually does, User_group stays the auth role.
  operations: {
    type: {
      priority: { type: String, default: '', trim: true },
      roleTitle: { type: String, default: '', trim: true },
      department: { type: String, default: '', trim: true },
      backupEligible: { type: Boolean, default: true },
      // Holds work without clocking in — the owner, or anyone whose
      // availability is not answered by an attendance record. Skips the
      // attendance gate only; being marked Busy or Outside still hands
      // inside-store work to the next slot in the chain.
      alwaysAvailable: { type: Boolean, default: false },
      active: { type: Boolean, default: true },
      // Working hours — initial values only, editable per user from the UI.
      // Empty strings mean "inherit the store-level setting".
      workingDays: { type: [Number], default: undefined }, // 0=Sun .. 6=Sat
      startTime: { type: String, default: '' },            // 'HH:MM'
      endTime: { type: String, default: '' },              // 'HH:MM'
      breakStart: { type: String, default: '' },
      breakEnd: { type: String, default: '' },
      // Runtime operational state, layered on top of (never replacing) the
      // existing Attendance record. Attendance answers "did they come in?";
      // this answers "are they at the bench right now?" — which is what lets
      // an Outside logistics run leave inside-store work untouched.
      state: {
        type: {
          status: {
            type: String,
            enum: ['Available', 'Busy', 'Outside'],
            default: 'Available',
          },
          currentTask: { type: String, default: '' },
          since: { type: Date, default: null },
          updatedBy: { type: String, default: '' },
        },
        default: () => ({ status: 'Available', currentTask: '', since: null, updatedBy: '' }),
      },
    },
    default: () => ({
      priority: '',
      roleTitle: '',
      department: '',
      backupEligible: true,
      alwaysAvailable: false,
      active: true,
      startTime: '',
      endTime: '',
      breakStart: '',
      breakEnd: '',
      state: { status: 'Available', currentTask: '', since: null, updatedBy: '' },
    }),
  },
  permissions: {
    type: {
      sidebarGroups: { type: [String], default: [] }, // empty = show all role-allowed groups
      canCreateOrders: { type: Boolean, default: true },
      canEditOrders:   { type: Boolean, default: true },
      canDeleteOrders: { type: Boolean, default: false },
      canViewReports:  { type: Boolean, default: true },
      canViewAccounts: { type: Boolean, default: true },
      canExportData:   { type: Boolean, default: false },
      // Accounting actions, split so that reading the ledger, posting to it and
      // removing from it can be granted separately. Deleting a financial record
      // defaults off, as canDeleteOrders does.
      canPostTransactions:   { type: Boolean, default: true },
      canEditTransactions:   { type: Boolean, default: true },
      canDeleteTransactions: { type: Boolean, default: false },
      // Integration actions that reach customers or external accounts.
      canUseEmail:           { type: Boolean, default: true },
      canManageDesignFiles:  { type: Boolean, default: true },
      // Governs the live WhatsApp message stream as well as the pages: every
      // authenticated socket used to receive every inbound message.
      canViewWhatsapp:       { type: Boolean, default: true },
      dashboardCards:  { type: [String], default: [] }, // empty = show all cards
      allowedWidgets:      { type: [String], default: [] }, // empty = allow all home widgets
      topNavHidden:        { type: [String], default: [] }, // top navbar dropdown labels hidden by admin
      footerHidden:        { type: [String], default: [] }, // footer link labels hidden by admin
      leftHidden:          { type: [String], default: [] }, // left sidebar item paths hidden by admin
      rightActionsHidden:  { type: [String], default: [] }, // right sidebar quick action labels hidden by admin
      rightLinksHidden:    { type: [String], default: [] }, // right sidebar quick link labels hidden by admin
      // Left/right sidebar & footer are opt-in: off by default until admin or user turns them on.
      leftSidebarEnabled:  { type: Boolean, default: false },
      rightSidebarEnabled: { type: Boolean, default: false },
      footerEnabled:       { type: Boolean, default: false },
    },
    default: () => ({
      sidebarGroups: [],
      canCreateOrders: true,
      canEditOrders: true,
      canDeleteOrders: false,
      canViewReports: true,
      canViewAccounts: true,
      canExportData: false,
      canPostTransactions: true,
      canEditTransactions: true,
      canDeleteTransactions: false,
      canUseEmail: true,
      canManageDesignFiles: true,
      canViewWhatsapp: true,
      dashboardCards: [],
      allowedWidgets: [],
      topNavHidden: [],
      footerHidden: [],
      leftHidden: [],
      rightActionsHidden: [],
      rightLinksHidden: [],
      leftSidebarEnabled: false,
      rightSidebarEnabled: false,
      footerEnabled: false,
    }),
  },
});

UsersSchema.pre('validate', function (next) {
  if (!this.User_uuid) this.User_uuid = uuidv4();
  if (this.isNew || this.User_identity_key) {
    this.User_identity_key = String(this.User_uuid || '').trim();
  }
  // Preserve AccountID for all existing consumers. Only copy it automatically
  // when it is already UUID-shaped; legacy names are resolved by the migration
  // against existing ledgers and are never auto-created or guessed here.
  const legacyAccountId = String(this.AccountID || '').trim();
  if (!this.Ledger_account_uuid && UUID_RE.test(legacyAccountId)) {
    this.Ledger_account_uuid = legacyAccountId;
  }
  next();
});

UsersSchema.index({ User_name: 1 });
UsersSchema.index({ User_group: 1 });
UsersSchema.index({ User_uuid: 1 });
UsersSchema.index(
  { User_identity_key: 1 },
  {
    unique: true,
    partialFilterExpression: { User_identity_key: { $type: 'string' } },
    name: 'User_identity_key_unique',
  }
);
UsersSchema.index({ Ledger_account_uuid: 1 });
UsersSchema.index({ 'operations.priority': 1 });
UsersSchema.index({ 'operations.active': 1 });

module.exports = mongoose.model("Users", UsersSchema);