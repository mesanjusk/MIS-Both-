const mongoose = require('mongoose');

/**
 * journalSchema – one line of a double-entry journal posting.
 *
 * Account_id   → Account_uuid from the Accounts collection (UUID, not a name).
 * Account_name → Denormalized display name stored alongside the UUID so that
 *                reports remain readable without additional DB lookups and so
 *                that legacy heuristics (e.g. isBusinessCustomerReceipt) still
 *                work on historical records.
 */
const journalSchema = new mongoose.Schema({
  Account_id:   { type: String, required: true },   // Account_uuid (FK → Accounts.Account_uuid)
  Account_name: { type: String, default: '' },       // Denormalized display name (read-only after insert)
  Type:         { type: String, required: true },    // 'Debit' | 'Credit'
  Amount:       { type: Number, required: true },
});

const TransactionSchema = new mongoose.Schema(
  {
    Transaction_uuid: { type: String },
    Transaction_id:   { type: Number },

    // Source document references
    Order_uuid:   { type: String, default: null },
    Order_number: { type: Number, default: null },

    Transaction_date: { type: Date,   required: true },
    Description:      { type: String, required: true },

    // Totals must always be equal (double-entry invariant)
    Total_Debit:  { type: Number, required: true },
    Total_Credit: { type: Number, required: true },

    Payment_mode: { type: String, required: true },
    Created_by:   { type: String, required: true },
    image:        { type: String },

    Journal_entry: [journalSchema],

    Customer_uuid: { type: String, default: null },

    // UPI metadata
    Upi_reference:   { type: String, default: '' },
    Upi_status:      { type: String, default: '' },
    Upi_app:         { type: String, default: '' },
    Upi_payee_vpa:   { type: String, default: '' },
    Upi_response_raw:{ type: mongoose.Schema.Types.Mixed, default: null },

    // Originating module / business event (e.g. 'business:customer_receipt')
    Source: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

// Query indexes
TransactionSchema.index({ Transaction_uuid: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ Transaction_id: 1 });
TransactionSchema.index({ Order_uuid: 1 });
TransactionSchema.index({ Order_number: 1 });
TransactionSchema.index({ Transaction_date: 1 });
TransactionSchema.index({ Transaction_date: -1 });
TransactionSchema.index({ Payment_mode: 1 });
TransactionSchema.index({ Created_by: 1 });
TransactionSchema.index({ Customer_uuid: 1 });
TransactionSchema.index({ Upi_reference: 1 });
TransactionSchema.index({ Transaction_date: -1, Created_by: 1 });

// Support fast lookup by journal account UUID
TransactionSchema.index({ 'Journal_entry.Account_id': 1 });

const Transaction = mongoose.model('Transaction', TransactionSchema);
module.exports = Transaction;
