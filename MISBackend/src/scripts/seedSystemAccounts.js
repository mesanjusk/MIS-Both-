/**
 * seedSystemAccounts.js
 *
 * Creates / ensures all system accounts exist in the Accounts collection with
 * their correct metadata (type, normal-balance side, account code, group).
 *
 * Safe to run multiple times – uses upsert on Account_name.
 *
 * Usage:
 *   node src/scripts/seedSystemAccounts.js
 */

'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');
const Accounts = require('../repositories/accounts');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/mis';

const SYSTEM_ACCOUNTS = [
  { name: 'Cash',                  type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',         code: 1001 },
  { name: 'Bank',                  type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',         code: 1002 },
  { name: 'UPI',                   type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',         code: 1003 },
  { name: 'Customer Receivable',   type: 'Asset',     normal_balance_side: 'debit',  group: 'Trade Receivables',   code: 1100 },
  { name: 'Customer Advance',      type: 'Liability', normal_balance_side: 'credit', group: 'Current Liabilities', code: 2100 },
  { name: 'Sales',                 type: 'Income',    normal_balance_side: 'credit', group: 'Revenue',             code: 4001 },
  { name: 'Vendor Payable',        type: 'Liability', normal_balance_side: 'credit', group: 'Trade Payables',      code: 2001 },
  { name: 'Vendor Advance',        type: 'Asset',     normal_balance_side: 'debit',  group: 'Advances',            code: 1200 },
  { name: 'Job Work Expense',      type: 'Expense',   normal_balance_side: 'debit',  group: 'Direct Costs',        code: 5001 },
  { name: 'Purchase',              type: 'Expense',   normal_balance_side: 'debit',  group: 'Direct Costs',        code: 5002 },
  { name: 'Stock',                 type: 'Asset',     normal_balance_side: 'debit',  group: 'Inventory',           code: 1300 },
  { name: 'General Expense',       type: 'Expense',   normal_balance_side: 'debit',  group: 'Operating Expenses',  code: 5100 },
  { name: 'Opening Balance Equity',type: 'Equity',    normal_balance_side: 'credit', group: 'Equity',              code: 3001 },
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let skipped = 0;

  for (const acct of SYSTEM_ACCOUNTS) {
    const existing = await Accounts.findOne({ Account_name: { $regex: new RegExp(`^${acct.name}$`, 'i') } }).lean();

    if (existing) {
      // Ensure new fields are set on existing records (non-destructive patch)
      const patch = {};
      if (!existing.Normal_balance_side) patch.Normal_balance_side = acct.normal_balance_side;
      if (!existing.Account_group)       patch.Account_group       = acct.group;
      if (existing.Is_system == null)    patch.Is_system           = true;

      if (Object.keys(patch).length) {
        await Accounts.updateOne({ _id: existing._id }, { $set: patch });
        console.log(`  ↑ Patched: ${acct.name}`);
      } else {
        console.log(`  ✓ Exists:  ${acct.name} (uuid: ${existing.Account_uuid})`);
      }
      skipped++;
    } else {
      const newAcct = await Accounts.create({
        Account_uuid:        uuid(),
        Account_name:        acct.name,
        Account_type:        acct.type,
        Account_code:        acct.code,
        Normal_balance_side: acct.normal_balance_side,
        Account_group:       acct.group,
        Is_system:           true,
        Balance:             0,
        Currency:            'INR',
        Created_at:          new Date(),
        Updated_at:          new Date(),
      });
      console.log(`  + Created: ${acct.name} (uuid: ${newAcct.Account_uuid})`);
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, Already existed: ${skipped}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
