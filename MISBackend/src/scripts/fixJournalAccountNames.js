/**
 * fixJournalAccountNames.js
 *
 * Finds every Journal_entry line where Account_name === Account_id
 * (i.e. the UUID was stored as the display name) and replaces it with
 * the real name looked up from the Customer or Accounts collections.
 *
 * Usage:
 *   node src/scripts/fixJournalAccountNames.js
 *   DRY_RUN=true node src/scripts/fixJournalAccountNames.js
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGO_URI) {
  console.error('ERROR: No MongoDB URI found in environment (MONGO_URI / MONGODB_URI / DATABASE_URL).');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === 'true';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid  = (v) => UUID_RE.test(String(v || '').trim());

// Minimal inline schemas to avoid full app bootstrap
const journalSchema = new mongoose.Schema({
  Account_id:   String,
  Account_name: String,
  Type:         String,
  Amount:       Number,
}, { _id: false });

const TransactionSchema = new mongoose.Schema({
  Transaction_uuid: String,
  Journal_entry:    [journalSchema],
}, { strict: false, timestamps: true });

const AccountSchema = new mongoose.Schema({
  Account_uuid: String,
  Account_name: String,
}, { strict: false });

const CustomerSchema = new mongoose.Schema({
  Customer_uuid: String,
  Customer_name: String,
}, { strict: false });

async function main() {
  console.log(`\n=== Fix Journal Account Names ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const Transaction = mongoose.model('Transaction', TransactionSchema);
  const Account     = mongoose.model('Accounts',    AccountSchema);
  const Customer    = mongoose.model('Customer',    CustomerSchema);

  // Build uuid → name lookup maps
  const uuidToName = new Map();

  const accounts = await Account.find({}, { Account_uuid: 1, Account_name: 1 }).lean();
  for (const a of accounts) {
    if (a.Account_uuid && a.Account_name) uuidToName.set(a.Account_uuid, a.Account_name);
  }
  console.log(`Loaded ${accounts.length} accounts`);

  const customers = await Customer.find({}, { Customer_uuid: 1, Customer_name: 1 }).lean();
  for (const c of customers) {
    // Customer names take priority (they are the user-visible party names)
    if (c.Customer_uuid && c.Customer_name) uuidToName.set(c.Customer_uuid, c.Customer_name);
  }
  console.log(`Loaded ${customers.length} customers\n`);

  // Scan all transactions; find lines where Account_name === Account_id
  const BATCH = 200;
  let skip         = 0;
  let totalScanned = 0;
  let totalUpdated = 0;
  let totalLines   = 0;

  while (true) {
    const batch = await Transaction.find({}).skip(skip).limit(BATCH).lean();
    if (!batch.length) break;
    skip += batch.length;

    const bulkOps = [];

    for (const txn of batch) {
      totalScanned++;
      const lines = Array.isArray(txn.Journal_entry) ? txn.Journal_entry : [];
      let changed = false;
      const newLines = [];

      for (const line of lines) {
        const accountId   = String(line.Account_id   || '').trim();
        const accountName = String(line.Account_name || '').trim();

        // Broken when the name field is the same UUID as the id field
        const isBroken = isUuid(accountId) && accountName === accountId;

        if (!isBroken) {
          newLines.push(line);
          continue;
        }

        const resolvedName = uuidToName.get(accountId);
        if (!resolvedName) {
          // UUID not found in either collection — leave as-is but log it
          console.warn(`  WARNING: no name found for UUID ${accountId} in txn ${txn.Transaction_uuid || txn._id}`);
          newLines.push(line);
          continue;
        }

        newLines.push({ ...line, Account_name: resolvedName });
        changed = true;
        totalLines++;
        if (DRY_RUN) {
          console.log(`  [DRY] txn ${txn.Transaction_uuid || txn._id}: "${accountId}" → "${resolvedName}"`);
        }
      }

      if (changed) {
        totalUpdated++;
        if (!DRY_RUN) {
          bulkOps.push({
            updateOne: {
              filter: { _id: txn._id },
              update: { $set: { Journal_entry: newLines } },
            },
          });
        }
      }
    }

    if (bulkOps.length) {
      await Transaction.bulkWrite(bulkOps, { ordered: false });
      console.log(`  Updated batch of ${bulkOps.length} transactions…`);
    }
  }

  console.log('\n════════════════════════════════════');
  console.log(`Transactions scanned : ${totalScanned}`);
  console.log(`Transactions updated : ${totalUpdated}`);
  console.log(`Journal lines fixed  : ${totalLines}`);
  if (DRY_RUN) console.log('\n[DRY RUN] No changes written to the database.');
  console.log('════════════════════════════════════\n');

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
