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
    }),
  },
});

UsersSchema.index({ User_name: 1 });
UsersSchema.index({ User_group: 1 });
UsersSchema.index({ User_uuid: 1 });

module.exports = mongoose.model("Users", UsersSchema);