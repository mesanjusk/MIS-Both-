/**
 * migrateAccountNamesToUuids.js
 *
 * One-time migration that rewrites every Transaction document's Journal_entry
 * lines so that Account_id stores the Account_uuid (from the Accounts collection)
 * instead of the legacy account-name string.
 *
 * Strategy:
 *   1. Ensure system accounts exist (runs seedSystemAccounts logic inline).
 *   2. Build a name→uuid map from the Accounts collection.
 *   3. Scan all Transaction documents.
 *   4. For each journal line whose Account_id does NOT look like a UUID, look
 *      up the matching uuid and rewrite both Account_id and Account_name.
 *   5. Write back only changed documents (bulk-write for performance).
 *
 * Safety:
 *   - DRY_RUN=true prints what would change without touching the DB.
 *   - Already-migrated lines (Account_id is a UUID) are left untouched.
 *   - Unknown account names are auto-created in the Accounts collection.
 *
 * Usage:
 *   node src/scripts/migrateAccountNamesToUuids.js
 *   DRY_RUN=true node src/scripts/migrateAccountNamesToUuids.js
 */

'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');
const Accounts    = require('../repositories/accounts');
const Transaction = require('../repositories/transaction');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/mis';
const DRY_RUN   = process.env.DRY_RUN === 'true';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid  = (s) => UUID_RE.test(String(s || '').trim());

// Metadata used when auto-creating unknown accounts
const SYSTEM_ACCOUNT_META = {
  'cash':                  { type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',         code: 1001 },
  'bank':                  { type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',         code: 1002 },
  'upi':                   { type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',         code: 1003 },
  'customer receivable':   { type: 'Asset',     normal_balance_side: 'debit',  group: 'Trade Receivables',   code: 1100 },
  'customer advance':      { type: 'Liability', normal_balance_side: 'credit', group: 'Current Liabilities', code: 2100 },
  'sales':                 { type: 'Income',    normal_balance_side: 'credit', group: 'Revenue',             code: 4001 },
  'vendor payable':        { type: 'Liability', normal_balance_side: 'credit', group: 'Trade Payables',      code: 2001 },
  'vendor advance':        { type: 'Asset',     normal_balance_side: 'debit',  group: 'Advances',            code: 1200 },
  'job work expense':      { type: 'Expense',   normal_balance_side: 'debit',  group: 'Direct Costs',        code: 5001 },
  'purchase':              { type: 'Expense',   normal_balance_side: 'debit',  group: 'Direct Costs',        code: 5002 },
  'stock':                 { type: 'Asset',     normal_balance_side: 'debit',  group: 'Inventory',           code: 1300 },
  'general expense':       { type: 'Expense',   normal_balance_side: 'debit',  group: 'Operating Expenses',  code: 5100 },
};

async function buildNameMap() {
  const accounts  = await Accounts.find({}).lean();
  const nameToUuid = new Map();
  const uuidToName = new Map();
  for (const acct of accounts) {
    if (acct.Account_uuid && acct.Account_name) {
      nameToUuid.set(acct.Account_name.toLowerCase(), acct.Account_uuid);
      uuidToName.set(acct.Account_uuid, acct.Account_name);
    }
  }
  return { nameToUuid, uuidToName };
}

async function ensureAccount(name, nameToUuid, uuidToName) {
  const key = String(name || '').trim().toLowerCase();
  if (nameToUuid.has(key)) return { uuid: nameToUuid.get(key), name: String(name).trim() };

  // Check DB
  const existing = await Accounts.findOne({ Account_name: { $regex: new RegExp(`^${name}$`, 'i') } }).lean();
  if (existing) {
    nameToUuid.set(key, existing.Account_uuid);
    uuidToName.set(existing.Account_uuid, existing.Account_name);
    return { uuid: existing.Account_uuid, name: existing.Account_name };
  }

  // Auto-create
  const meta     = SYSTEM_ACCOUNT_META[key] || { type: 'Asset', normal_balance_side: 'debit', group: 'General', code: null };
  const acctUuid = uuid();
  const lastCode = await Accounts.findOne({}, { Account_code: 1 }).sort({ Account_code: -1 }).lean();
  const code     = meta.code || Number(lastCode?.Account_code || 1000) + 1;

  await Accounts.create({
    Account_uuid:        acctUuid,
    Account_name:        String(name).trim(),
    Account_type:        meta.type,
    Account_code:        code,
    Normal_balance_side: meta.normal_balance_side,
    Account_group:       meta.group,
    Is_system:           Object.prototype.hasOwnProperty.call(SYSTEM_ACCOUNT_META, key),
    Balance:             0,
    Currency:            'INR',
    Created_at:          new Date(),
    Updated_at:          new Date(),
  });

  nameToUuid.set(key, acctUuid);
  uuidToName.set(acctUuid, String(name).trim());
  console.log(`  + Auto-created account: "${name}" → ${acctUuid}`);
  return { uuid: acctUuid, name: String(name).trim() };
}

async function run() {
  console.log(`\n=== Account Name → UUID Migration ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  let { nameToUuid, uuidToName } = await buildNameMap();
  console.log(`Loaded ${nameToUuid.size} accounts from DB\n`);

  // Process in batches to avoid loading all transactions into memory
  const BATCH_SIZE = 200;
  let skip         = 0;
  let totalDocs    = 0;
  let totalChanged = 0;
  let totalLines   = 0;

  while (true) {
    const batch = await Transaction.find({}).skip(skip).limit(BATCH_SIZE).lean();
    if (!batch.length) break;
    skip += batch.length;

    const bulkOps = [];

    for (const txn of batch) {
      totalDocs++;
      const lines = Array.isArray(txn.Journal_entry) ? txn.Journal_entry : [];
      let docChanged = false;
      const newLines = [];

      for (const line of lines) {
        const accountId = String(line.Account_id || '').trim();

        if (isUuid(accountId)) {
          // Already a UUID – ensure Account_name is populated
          let displayName = line.Account_name || uuidToName.get(accountId) || '';
          if (!displayName) {
            const acct = await Accounts.findOne({ Account_uuid: accountId }).lean();
            displayName = acct?.Account_name || accountId;
          }
          newLines.push({ ...line, Account_id: accountId, Account_name: displayName });
        } else {
          // Legacy name string – resolve to UUID
          const { uuid: resolvedUuid, name: resolvedName } = await ensureAccount(accountId, nameToUuid, uuidToName);
          newLines.push({
            Account_id:   resolvedUuid,
            Account_name: resolvedName,
            Type:         line.Type,
            Amount:       line.Amount,
          });
          if (resolvedUuid !== accountId) {
            docChanged = true;
            totalLines++;
          }
        }
      }

      if (docChanged) {
        totalChanged++;
        if (!DRY_RUN) {
          bulkOps.push({
            updateOne: {
              filter: { _id: txn._id },
              update: { $set: { Journal_entry: newLines } },
            },
          });
        } else {
          console.log(`  [DRY] Would update txn ${txn.Transaction_uuid || txn._id}`);
        }
      }
    }

    if (bulkOps.length) {
      await Transaction.bulkWrite(bulkOps, { ordered: false });
      process.stdout.write(`  Migrated batch (${bulkOps.length} docs)...\n`);
    }
  }

  console.log(`\n────────────────────────────────────`);
  console.log(`Total transactions scanned : ${totalDocs}`);
  console.log(`Transactions updated       : ${totalChanged}`);
  console.log(`Journal lines rewritten    : ${totalLines}`);
  if (DRY_RUN) console.log('\n[DRY RUN] No changes were written to the database.');
  console.log(`────────────────────────────────────\n`);

  await mongoose.disconnect();
  console.log('Migration complete.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
