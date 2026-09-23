const mongoose = require('mongoose');

const normalizeAccountNameKey = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const AccountsSchema = new mongoose.Schema(
  {
    Account_uuid:        { type: String, required: true },
    Account_name:        { type: String, required: true },
    // Additive integrity key. Existing rows are intentionally left without it
    // until the safe migration proves the normalized name is unambiguous.
    // New rows get it automatically and are protected by a partial unique index.
    Account_name_key:    { type: String, default: undefined, select: false },
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

AccountsSchema.pre('validate', function (next) {
  // Do not silently key historical rows on ordinary saves: a legacy database
  // may contain duplicate names. The migration backfills only proven-unique
  // historical names. New accounts are protected immediately.
  if (this.isNew || this.Account_name_key) {
    this.Account_name_key = normalizeAccountNameKey(this.Account_name);
  }
  next();
});

AccountsSchema.index({ Account_uuid: 1 },    { unique: true });
AccountsSchema.index({ Account_name: 1 });
AccountsSchema.index(
  { Account_name_key: 1 },
  {
    unique: true,
    partialFilterExpression: { Account_name_key: { $type: 'string' } },
    name: 'Account_name_key_unique',
  }
);
AccountsSchema.index({ Account_type: 1 });
AccountsSchema.index({ Account_code: 1 });
AccountsSchema.index({ Account_group: 1 });
AccountsSchema.index({ Is_system: 1 });

const Accounts = mongoose.model('Accounts', AccountsSchema);
module.exports = Accounts;
