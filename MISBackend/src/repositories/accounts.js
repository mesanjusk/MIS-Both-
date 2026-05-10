const mongoose = require('mongoose');

const AccountsSchema = new mongoose.Schema(
  {
    Account_uuid:        { type: String, required: true },
    Account_name:        { type: String, required: true },
    Account_type:        { type: String, required: true },
    Account_code:        { type: Number, required: true },

    // 'debit' for Asset/Expense; 'credit' for Liability/Equity/Income.
    // Determines sign convention when computing the running balance.
    Normal_balance_side: {
      type:    String,
      enum:    ['debit', 'credit'],
      default: 'debit',
    },

    // Logical grouping, e.g. "Cash & Bank", "Trade Receivables"
    Account_group: { type: String, default: '' },

    // true = created by the system; false = created by a user
    Is_system: { type: Boolean, default: false },

    Balance:     { type: Number, required: true, default: 0 },
    Currency:    { type: String, required: true, default: 'INR' },
    Created_at:  { type: Date,   required: true, default: Date.now },
    Updated_at:  { type: Date,   required: true, default: Date.now },
  },
  { timestamps: true }
);

AccountsSchema.index({ Account_uuid: 1 },    { unique: true });
AccountsSchema.index({ Account_name: 1 });
AccountsSchema.index({ Account_type: 1 });
AccountsSchema.index({ Account_code: 1 });
AccountsSchema.index({ Account_group: 1 });
AccountsSchema.index({ Is_system: 1 });

const Accounts = mongoose.model('Accounts', AccountsSchema);
module.exports = Accounts;
