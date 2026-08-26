const mongoose = require("mongoose");

const UsersSchema = new mongoose.Schema({
  User_uuid: { type: String },
  employeeId: { type: String },
  name: { type: String },
  phone: { type: String, unique: true, sparse: true },
  User_name: { type: String, required: true },
  Password: { type: String, required: true },
  Mobile_number: { type: String, required: true, unique: true },
  User_group: { type: String, required: true },
  Amount: { type: Number, required: true },
  AccountID: { type: String },
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

UsersSchema.index({ User_name: 1 });
UsersSchema.index({ User_group: 1 });
UsersSchema.index({ User_uuid: 1 });
UsersSchema.index({ 'operations.priority': 1 });
UsersSchema.index({ 'operations.active': 1 });

module.exports = mongoose.model("Users", UsersSchema);