const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const normalizePartyRoles = (roles = []) => {
  const allowed = new Set(["customer", "vendor"]);
  const normalized = Array.isArray(roles)
    ? roles
        .map((role) => String(role || "").trim().toLowerCase())
        .filter((role) => allowed.has(role))
    : [];

  return normalized.length ? [...new Set(normalized)] : ["customer"];
};

const CustomersSchema = new mongoose.Schema({
  Customer_uuid: { type: String },
  // Additive integrity key: new customers are protected immediately while
  // historical rows are backfilled only after the migration confirms the UUID
  // is not shared by more than one party.
  Customer_identity_key: { type: String, default: undefined, select: false },
  Customer_name: { type: String, required: true },
  Mobile_number: { type: String },
  Email: { type: String, default: '', trim: true },
  Customer_group: { type: String, required: true },
  Status: { type: String, default: "active" },
  Tags: { type: [String], default: [] },
  PartyRoles: {
    type: [String],
    enum: ["customer", "vendor"],
    default: ["customer"],
    set: normalizePartyRoles,
  },
  LastInteraction: { type: Date, default: Date.now },
  Opening_balance: { type: Number, default: 0 },
  Opening_balance_type: { type: String, enum: ["debit", "credit"], default: "debit" },
  Opening_balance_date: { type: Date, default: null },
  // Which pipeline stage(s) this party works — only meaningful (and only
  // shown in the UI) when Customer_group is "Account Payable": that group is
  // this business's real, admin-maintained list of who they owe money to
  // (vendors, freelancers, contractors, even employees paid this way), unlike
  // the auto-populated vendor_masters collection. Tagging a capability here
  // is what makes that party assignable on a given task stage.
  Capabilities: {
    type: [String],
    enum: ["design", "print", "postprint", "delivery"],
    default: [],
  },
});

CustomersSchema.pre("validate", function (next) {
  if (!this.Customer_uuid) this.Customer_uuid = uuidv4();
  // Only new rows are keyed automatically. Existing rows are deliberately not
  // keyed just because they are edited; the migration first checks duplicates.
  if (this.isNew || this.Customer_identity_key) {
    this.Customer_identity_key = String(this.Customer_uuid || '').trim();
  }

  if (!Array.isArray(this.PartyRoles) || this.PartyRoles.length === 0) {
    this.PartyRoles = ["customer"];
  }

  if (!Array.isArray(this.Tags)) {
    this.Tags = [];
  }

  const lowerTags = new Set(this.Tags.map((tag) => String(tag || "").trim().toLowerCase()));
  if (this.PartyRoles.includes("vendor")) lowerTags.add("vendor");
  if (this.PartyRoles.includes("customer")) lowerTags.add("customer");
  this.Tags = [...lowerTags].filter(Boolean);

  next();
});

CustomersSchema.index({ Customer_name: 1 });
CustomersSchema.index({ Mobile_number: 1 }, { unique: true, sparse: true });
CustomersSchema.index({ Customer_group: 1 });
CustomersSchema.index({ Status: 1 });
CustomersSchema.index({ Customer_uuid: 1 });
CustomersSchema.index(
  { Customer_identity_key: 1 },
  {
    unique: true,
    partialFilterExpression: { Customer_identity_key: { $type: "string" } },
    name: "Customer_identity_key_unique",
  }
);
CustomersSchema.index({ LastInteraction: -1 });
CustomersSchema.index({ PartyRoles: 1 });

module.exports = mongoose.model("Customers", CustomersSchema);
