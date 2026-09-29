// Models/paymentFollowup.js
const mongoose = require("mongoose");

const paymentFollowupSchema = new mongoose.Schema(
  {
    followup_uuid: { type: String, required: true, index: true, unique: true },
    customer_name: { type: String, required: true, index: true },
    customer_uuid: { type: String, default: '', index: true },
    // Ledger receivable when the follow-up was created. Legacy name-only
    // records retain 0 and are never automatically marked settled.
    baseline_outstanding: { type: Number, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    assigned_to: { type: String, default: '' },
    promised_date: { type: Date, default: null },
    last_reminder: { type: Date, default: null },
    reminder_count: { type: Number, default: 0 },
    reminder_lock_until: { type: Date, default: null },
    closed_at: { type: Date, default: null },
    closure_reason: { type: String, default: '' },
    history: [{
      at: { type: Date, default: Date.now },
      by: { type: String, default: '' },
      action: { type: String, required: true },
      note: { type: String, default: '' },
    }],
    // Preserve fields written by the former overdue-reminder endpoint.
    Last_Reminder: { type: Date, default: null },
    Reminder_Count: { type: Number, default: 0 },
    title: { type: String, default: "" }, // short reason/subject
    remark: { type: String, default: "" },
    followup_date: { type: Date, required: true }, // default handled in route
    status: {
      type: String,
      enum: ["pending", "done"],
      default: "pending",
      index: true,
    },
    created_by: { type: String, default: "" }, // optional: user name/id
  },
  { timestamps: true }
);

paymentFollowupSchema.index({ status: 1, followup_date: 1 });
paymentFollowupSchema.index({ customer_uuid: 1, status: 1 });

module.exports = mongoose.model("PaymentFollowup", paymentFollowupSchema);
