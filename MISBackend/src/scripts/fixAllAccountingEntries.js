/**
 * fixAllAccountingEntries.js
 *
 * One-time migration script that fixes every known accounting data quality
 * issue in the Transaction collection.
 *
 * Run with:
 *   node src/scripts/fixAllAccountingEntries.js
 *
 * What it fixes
 * ─────────────
 * Pass A – Swap reversed manual Receipt / Payment journal lines
 *   Transactions from the old AddTransaction.jsx (receipt) and
 *   addTransaction1.jsx (payment) pages stored journals with DR/CR
 *   swapped.  Identified by Source = '' and Payment_mode not being a
 *   system label ('Journal', 'Opening Balance').
 *
 * Pass B – Swap reversed UPI payment journal lines
 *   UpiPayment.jsx stored DR Bank / CR Customer (wrong for a payment).
 *   Identified by Source in ['UPI_QR_SCAN', 'UPI_INTENT'].
 *
 * Pass C – Resolve diary account name strings to UUIDs
 *   DiaryDraft confirm stored account names as Account_id for the
 *   counter-leg.  Identified by Source = 'diary'.
 *
 * Pass D – Resolve Payment_mode name → Customer UUID
 *   Manual entries stored the human-readable account name (e.g. "Cash")
 *   instead of the Customer_uuid of that Bank-and-Account record.
 *
 * Pass E – Fix Opening Balance entries
 *   addRecievable stored DR hardcoded-UUID / CR Customer (wrong).
 *   addPayable stored DR Customer / CR hardcoded-UUID (wrong).
 *   Correct: Receivable = DR Customer / CR Opening Balance Equity.
 *             Payable    = DR Opening Balance Equity / CR Customer.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGO_URI) {
  console.error('ERROR: No MongoDB URI found in environment (MONGO_URI / MONGODB_URI / DATABASE_URL).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Minimal inline models (avoids pulling in full app bootstrap)
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid  = (v) => UUID_RE.test(String(v || '').trim());

const journalSchema = new mongoose.Schema({
  Account_id:   { type: String },
  Account_name: { type: String, default: '' },
  Type:         { type: String },
  Amount:       { type: Number },
}, { _id: false });

const TransactionSchema = new mongoose.Schema({
  Transaction_uuid: String,
  Transaction_date: Date,
  Description:      String,
  Total_Debit:      Number,
  Total_Credit:     Number,
  Payment_mode:     String,
  Created_by:       String,
  Journal_entry:    [journalSchema],
  Source:           { type: String, default: '' },
  Order_uuid:       String,
  Order_number:     Number,
  Customer_uuid:    String,
}, { timestamps: true, strict: false });

const AccountSchema = new mongoose.Schema({
  Account_uuid: String,
  Account_name: String,
}, { strict: false });

const CustomerSchema = new mongoose.Schema({
  Customer_uuid:  String,
  Customer_name:  String,
  Customer_group: String,
}, { strict: false });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function swapTypes(journal = []) {
  return journal.map((line) => ({
    ...line,
    Type: line.Type === 'Debit' ? 'Credit' : line.Type === 'Credit' ? 'Debit' : line.Type,
  }));
}

async function buildNameToUuidMap(Account) {
  const accounts = await Account.find({}, { Account_uuid: 1, Account_name: 1 }).lean();
  const map = new Map();
  for (const a of accounts) {
    if (a.Account_uuid && a.Account_name) {
      map.set(a.Account_name.toLowerCase().trim(), a.Account_uuid);
    }
  }
  return map;
}

async function getOrCreateAccount(Account, name, nameToUuid) {
  const key = name.toLowerCase().trim();
  if (nameToUuid.has(key)) return nameToUuid.get(key);

  const existing = await Account.findOne({ Account_name: { $regex: new RegExp(`^${name}$`, 'i') } }).lean();
  if (existing?.Account_uuid) {
    nameToUuid.set(key, existing.Account_uuid);
    return existing.Account_uuid;
  }

  // Auto-create opening balance equity if missing
  const newUuid = uuid();
  await Account.create({
    Account_uuid:        newUuid,
    Account_name:        name,
    Account_type:        'Equity',
    Account_code:        3001,
    Normal_balance_side: 'credit',
    Account_group:       'Equity',
    Is_system:           true,
    Balance:             0,
    Currency:            'INR',
    Created_at:          new Date(),
    Updated_at:          new Date(),
  });
  nameToUuid.set(key, newUuid);
  return newUuid;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const Transaction = mongoose.model('Transaction', TransactionSchema);
  const Account     = mongoose.model('Accounts',    AccountSchema);
  const Customer    = mongoose.model('Customer',    CustomerSchema);

  const nameToUuid      = await buildNameToUuidMap(Account);
  const allTxnCount     = await Transaction.countDocuments();
  console.log(`Total transactions in DB: ${allTxnCount}\n`);

  // Build bank-and-account customer map:  name.toLowerCase() → Customer_uuid
  const bankCustomers = await Customer.find({ Customer_group: 'Bank and Account' }).lean();
  const bankNameToUuid = new Map();
  const bankUuidSet    = new Set();
  for (const c of bankCustomers) {
    if (c.Customer_uuid) {
      bankNameToUuid.set((c.Customer_name || '').toLowerCase().trim(), c.Customer_uuid);
      bankUuidSet.add(c.Customer_uuid);
    }
  }

  let passAFixed = 0;
  let passBFixed = 0;
  let passCFixed = 0;
  let passDFixed = 0;
  let passEFixed = 0;

  // ── PASS A: Swap reversed manual Receipt / Payment entries ────────────────
  console.log('Pass A — Swapping reversed manual Receipt/Payment entries…');
  {
    const SKIP_MODES = new Set(['journal', 'opening balance', '']);
    const cursor = Transaction.find({
      $or: [{ Source: '' }, { Source: null }, { Source: { $exists: false } }],
    }).lean().cursor();

    for await (const txn of cursor) {
      const mode = (txn.Payment_mode || '').toLowerCase().trim();
      if (SKIP_MODES.has(mode)) continue;
      if (!Array.isArray(txn.Journal_entry) || txn.Journal_entry.length < 2) continue;

      await Transaction.updateOne(
        { _id: txn._id },
        { $set: { Journal_entry: swapTypes(txn.Journal_entry) } }
      );
      passAFixed++;
    }
  }
  console.log(`  → Fixed ${passAFixed} transactions.\n`);

  // ── PASS B: Swap reversed UPI payment entries ─────────────────────────────
  console.log('Pass B — Swapping reversed UPI payment entries…');
  {
    const cursor = Transaction.find({
      Source: { $in: ['UPI_QR_SCAN', 'UPI_INTENT'] },
    }).lean().cursor();

    for await (const txn of cursor) {
      if (!Array.isArray(txn.Journal_entry) || txn.Journal_entry.length < 2) continue;

      await Transaction.updateOne(
        { _id: txn._id },
        { $set: { Journal_entry: swapTypes(txn.Journal_entry) } }
      );
      passBFixed++;
    }
  }
  console.log(`  → Fixed ${passBFixed} transactions.\n`);

  // ── PASS C: Resolve diary account name strings → UUIDs ───────────────────
  console.log('Pass C — Resolving diary account_assigned names to UUIDs…');
  {
    const cursor = Transaction.find({ Source: 'diary' }).lean().cursor();

    for await (const txn of cursor) {
      if (!Array.isArray(txn.Journal_entry)) continue;

      let changed = false;
      const newJournal = [];

      for (const line of txn.Journal_entry) {
        if (isUuid(line.Account_id)) {
          newJournal.push(line);
          continue;
        }
        // Account_id is a name — resolve to UUID
        const resolvedUuid = await getOrCreateAccount(Account, line.Account_id, nameToUuid);
        newJournal.push({ ...line, Account_id: resolvedUuid, Account_name: line.Account_id });
        changed = true;
      }

      if (changed) {
        await Transaction.updateOne({ _id: txn._id }, { $set: { Journal_entry: newJournal } });
        passCFixed++;
      }
    }
  }
  console.log(`  → Fixed ${passCFixed} transactions.\n`);

  // ── PASS D: Resolve Payment_mode name → Customer UUID ────────────────────
  console.log('Pass D — Updating Payment_mode name strings to Customer UUIDs…');
  {
    const SKIP = new Set(['journal', 'opening balance', 'purchase', 'advance', 'bank', 'upi', 'cash']);
    const cursor = Transaction.find({}).lean().cursor();

    for await (const txn of cursor) {
      const raw = (txn.Payment_mode || '').trim();
      if (!raw || isUuid(raw)) continue;                      // already UUID or empty
      if (SKIP.has(raw.toLowerCase())) continue;              // system label — leave as-is

      const matched = bankNameToUuid.get(raw.toLowerCase());
      if (!matched) continue;

      await Transaction.updateOne(
        { _id: txn._id },
        { $set: { Payment_mode: matched } }
      );
      passDFixed++;
    }
  }
  console.log(`  → Fixed ${passDFixed} transactions.\n`);

  // ── PASS E: Fix Opening Balance entries ───────────────────────────────────
  console.log('Pass E — Fixing Opening Balance (receivable/payable) journal entries…');
  {
    const OBE_NAME = 'Opening Balance Equity';
    const obeUuid  = await getOrCreateAccount(Account, OBE_NAME, nameToUuid);

    const cursor = Transaction.find({ Payment_mode: 'Opening Balance' }).lean().cursor();

    for await (const txn of cursor) {
      if (!Array.isArray(txn.Journal_entry) || txn.Journal_entry.length !== 2) continue;

      const [leg0, leg1] = txn.Journal_entry;

      // Identify if a leg uses a non-UUID (hardcoded UUID from old code) for the equity side
      // Both addRecievable and addPayable used '81f36451-41f2-402d-9dd3-cc11af039142' as the equity leg
      const LEGACY_OBE = '81f36451-41f2-402d-9dd3-cc11af039142';

      const hasLegacyObe = leg0.Account_id === LEGACY_OBE || leg1.Account_id === LEGACY_OBE;
      const isAlreadyFixed = (leg0.Account_id === obeUuid || leg1.Account_id === obeUuid);

      if (!hasLegacyObe || isAlreadyFixed) continue;

      // Replace the legacy OBE UUID with the real one
      const newJournal = txn.Journal_entry.map((line) => {
        if (line.Account_id === LEGACY_OBE) {
          return { ...line, Account_id: obeUuid, Account_name: OBE_NAME };
        }
        return line;
      });

      // addRecievable posted: DR legacy-OBE, CR customer → correct is DR customer, CR OBE
      // addPayable posted:    DR customer, CR legacy-OBE → correct is DR OBE, CR customer
      // In both cases we just swap + replace legacy UUID → actual OBE uuid
      const fixedJournal = swapTypes(newJournal);

      await Transaction.updateOne(
        { _id: txn._id },
        { $set: { Journal_entry: fixedJournal } }
      );
      passEFixed++;
    }
  }
  console.log(`  → Fixed ${passEFixed} transactions.\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════');
  console.log('Migration complete.');
  console.log(`  Pass A (reversed manual):     ${passAFixed}`);
  console.log(`  Pass B (reversed UPI):        ${passBFixed}`);
  console.log(`  Pass C (diary name→UUID):     ${passCFixed}`);
  console.log(`  Pass D (Payment_mode→UUID):   ${passDFixed}`);
  console.log(`  Pass E (opening balance fix): ${passEFixed}`);
  console.log(`  Total fixed: ${passAFixed + passBFixed + passCFixed + passDFixed + passEFixed}`);
  console.log('═══════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
