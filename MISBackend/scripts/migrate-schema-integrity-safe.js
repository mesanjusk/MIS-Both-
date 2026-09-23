/*
 * Safe schema-integrity migration.
 *
 * DEFAULT: report only. Nothing is written.
 *   node scripts/migrate-schema-integrity-safe.js
 *
 * SAFE BACKFILL: fills only missing/unambiguous additive fields.
 *   node scripts/migrate-schema-integrity-safe.js --apply
 *
 * SAFE INDEXES: with --apply, creates the new partial indexes after backfill.
 * Existing ambiguous/duplicate rows are deliberately left untouched and are
 * printed in the report. This script never deletes, merges, or renumbers data.
 *   node scripts/migrate-schema-integrity-safe.js --apply --indexes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { businessDateString } = require('../src/utils/businessDay');

const APPLY = process.argv.includes('--apply');
const CREATE_INDEXES = process.argv.includes('--indexes');
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI is not set. Nothing was changed.');
  process.exit(1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

function groupBy(rows, getKey) {
  const map = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function duplicateSummary(map, label, describe = (row) => String(row?._id || '')) {
  const duplicates = [];
  for (const [key, rows] of map.entries()) {
    if (rows.length <= 1) continue;
    duplicates.push({ key, count: rows.length, rows: rows.slice(0, 10).map(describe) });
  }
  if (duplicates.length) {
    console.log(`\n[UNRESOLVED] ${label}: ${duplicates.length} duplicate group(s)`);
    for (const d of duplicates.slice(0, 20)) {
      console.log(`  ${d.key} x${d.count} -> ${d.rows.join(', ')}`);
    }
  }
  return duplicates;
}

async function main() {
  await mongoose.connect(MONGO_URI, { autoIndex: false });
  const db = mongoose.connection;

  const collections = {
    accounts: db.collection('accounts'),
    customers: db.collection('customers'),
    users: db.collection('users'),
    attendances: db.collection('attendances'),
    diarydrafts: db.collection('diarydrafts'),
    bankstatements: db.collection('bankstatements'),
    purchaseorders: db.collection('purchaseorders'),
    items: db.collection('items'),
    transactions: db.collection('transactions'),
  };

  const stats = {
    mode: APPLY ? 'apply-safe-backfills' : 'report-only',
    writes: 0,
    skippedAmbiguous: 0,
    unresolved: {},
  };

  const write = async (collection, filter, update) => {
    if (!APPLY) return { modifiedCount: 0 };
    const result = await collection.updateOne(filter, update);
    stats.writes += Number(result.modifiedCount || 0);
    return result;
  };

  console.log(`Schema integrity migration mode: ${stats.mode}`);
  console.log('No delete/merge/renumber operations exist in this script.');

  // -----------------------------------------------------------------------
  // 1) Backfill only genuinely missing customer/user UUIDs.
  // Missing UUIDs cannot be a stable target for existing UUID-based links, so
  // assigning one is additive and does not rewrite any relationship.
  // -----------------------------------------------------------------------
  let customers = await collections.customers.find({}).toArray();
  let users = await collections.users.find({}).toArray();

  const missingCustomerUuid = customers.filter((row) => !String(row.Customer_uuid || '').trim());
  const missingUserUuid = users.filter((row) => !String(row.User_uuid || '').trim());
  console.log(`\nMissing Customer_uuid: ${missingCustomerUuid.length}`);
  console.log(`Missing User_uuid    : ${missingUserUuid.length}`);

  for (const row of missingCustomerUuid) {
    await write(collections.customers, { _id: row._id, $or: [{ Customer_uuid: { $exists: false } }, { Customer_uuid: '' }, { Customer_uuid: null }] }, { $set: { Customer_uuid: uuidv4() } });
  }
  for (const row of missingUserUuid) {
    await write(collections.users, { _id: row._id, $or: [{ User_uuid: { $exists: false } }, { User_uuid: '' }, { User_uuid: null }] }, { $set: { User_uuid: uuidv4() } });
  }

  if (APPLY && (missingCustomerUuid.length || missingUserUuid.length)) {
    customers = await collections.customers.find({}).toArray();
    users = await collections.users.find({}).toArray();
  }

  const customerUuidGroups = groupBy(customers, (row) => String(row.Customer_uuid || '').trim());
  const userUuidGroups = groupBy(users, (row) => String(row.User_uuid || '').trim());
  const customerUuidDupes = duplicateSummary(customerUuidGroups, 'Customer_uuid', (r) => `${r.Customer_name || ''}#${r._id}`);
  const userUuidDupes = duplicateSummary(userUuidGroups, 'User_uuid', (r) => `${r.User_name || ''}#${r._id}`);
  stats.unresolved.customerUuidDuplicates = customerUuidDupes.length;
  stats.unresolved.userUuidDuplicates = userUuidDupes.length;

  // New integrity keys provide progressive uniqueness without forcing a risky
  // unique index onto legacy UUID fields. Backfill only UUIDs used by one row.
  for (const [customerUuid, rows] of customerUuidGroups.entries()) {
    if (!customerUuid || rows.length !== 1) continue;
    const row = rows[0];
    if (String(row.Customer_identity_key || '').trim()) continue;
    await write(collections.customers, { _id: row._id, Customer_identity_key: { $in: [null, ''] } }, { $set: { Customer_identity_key: customerUuid } });
  }
  for (const [userUuid, rows] of userUuidGroups.entries()) {
    if (!userUuid || rows.length !== 1) continue;
    const row = rows[0];
    if (String(row.User_identity_key || '').trim()) continue;
    await write(collections.users, { _id: row._id, User_identity_key: { $in: [null, ''] } }, { $set: { User_identity_key: userUuid } });
  }

  // -----------------------------------------------------------------------
  // 2) Accounts: normalized name key only when the historical name is unique.
  // Duplicate names are reported and deliberately left unkeyed.
  // -----------------------------------------------------------------------
  const accounts = await collections.accounts.find({}).toArray();
  const accountNameGroups = groupBy(accounts, (row) => norm(row.Account_name));
  const accountNameDupes = duplicateSummary(accountNameGroups, 'normalized account name', (r) => `${r.Account_name || ''}#${r.Account_uuid || r._id}`);
  stats.unresolved.accountNameDuplicates = accountNameDupes.length;

  for (const [nameKey, rows] of accountNameGroups.entries()) {
    if (!nameKey || rows.length !== 1) continue;
    const row = rows[0];
    if (String(row.Account_name_key || '').trim()) continue;
    await write(collections.accounts, { _id: row._id, Account_name_key: { $exists: false } }, { $set: { Account_name_key: nameKey } });
  }

  const accountCodeGroups = groupBy(accounts, (row) => row.Account_code === undefined || row.Account_code === null ? '' : String(row.Account_code));
  const accountCodeDupes = duplicateSummary(accountCodeGroups, 'Account_code', (r) => `${r.Account_name || ''}#${r.Account_uuid || r._id}`);
  stats.unresolved.accountCodeDuplicates = accountCodeDupes.length;

  // -----------------------------------------------------------------------
  // Build authoritative lookup maps. Names are used only for safe migration
  // discovery. UUID remains the stored identity.
  // -----------------------------------------------------------------------
  const accountByUuid = new Map(accounts.filter((r) => r.Account_uuid).map((r) => [String(r.Account_uuid), r]));
  const customerByUuid = new Map(customers.filter((r) => r.Customer_uuid).map((r) => [String(r.Customer_uuid), r]));
  const ledgerNameMap = new Map();
  const addLedgerName = (name, candidate) => {
    const key = norm(name);
    if (!key) return;
    const list = ledgerNameMap.get(key) || [];
    list.push(candidate);
    ledgerNameMap.set(key, list);
  };
  for (const row of accounts) addLedgerName(row.Account_name, { uuid: row.Account_uuid, name: row.Account_name, type: 'account' });
  for (const row of customers) addLedgerName(row.Customer_name, { uuid: row.Customer_uuid, name: row.Customer_name, type: 'customer' });

  // Staff canonical ledger UUID: copy only a verified legacy AccountID mapping.
  for (const user of users) {
    if (String(user.Ledger_account_uuid || '').trim()) continue;
    const raw = String(user.AccountID || '').trim();
    if (!raw) continue;

    let candidate = null;
    if (accountByUuid.has(raw)) {
      const row = accountByUuid.get(raw);
      candidate = { uuid: raw, name: row.Account_name, type: 'account' };
    } else if (customerByUuid.has(raw)) {
      const row = customerByUuid.get(raw);
      candidate = { uuid: raw, name: row.Customer_name, type: 'customer' };
    } else {
      const matches = (ledgerNameMap.get(norm(raw)) || []).filter((m) => m.uuid);
      if (matches.length === 1) candidate = matches[0];
    }

    if (!candidate) {
      stats.skippedAmbiguous += 1;
      continue;
    }
    await write(collections.users, { _id: user._id, Ledger_account_uuid: { $in: [null, ''] } }, { $set: { Ledger_account_uuid: candidate.uuid } });
  }

  // Include uniquely named employees that now have a verified ledger mapping as
  // optional discovery candidates for diary/bank legacy names.
  if (APPLY) users = await collections.users.find({}).toArray();
  const userNameGroups = groupBy(users, (row) => norm(row.User_name));
  for (const [nameKey, rows] of userNameGroups.entries()) {
    if (!nameKey || rows.length !== 1) continue;
    const user = rows[0];
    const ledgerUuid = String(user.Ledger_account_uuid || '').trim();
    if (!ledgerUuid) continue;
    const ledger = accountByUuid.get(ledgerUuid) || customerByUuid.get(ledgerUuid);
    if (!ledger) continue;
    addLedgerName(user.User_name, {
      uuid: ledgerUuid,
      name: ledger.Account_name || ledger.Customer_name || user.User_name,
      type: 'employee',
    });
  }

  function resolveLegacyLedger(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (accountByUuid.has(raw)) {
      const row = accountByUuid.get(raw);
      return { uuid: raw, name: row.Account_name, type: 'account' };
    }
    if (customerByUuid.has(raw)) {
      const row = customerByUuid.get(raw);
      return { uuid: raw, name: row.Customer_name, type: 'customer' };
    }
    const matches = (ledgerNameMap.get(norm(raw)) || []).filter((m) => m.uuid);
    const byUuid = new Map(matches.map((m) => [m.uuid, m]));
    return byUuid.size === 1 ? [...byUuid.values()][0] : null;
  }

  // -----------------------------------------------------------------------
  // 3) Diary and bank statement assignment backfill. Whole arrays are written
  // only when at least one missing canonical identity is resolved safely.
  // -----------------------------------------------------------------------
  const diaries = await collections.diarydrafts.find({ 'entries.account_assigned': { $nin: [null, ''] } }).toArray();
  let diaryResolved = 0;
  let diarySkipped = 0;
  for (const doc of diaries) {
    let changed = false;
    const entries = (doc.entries || []).map((entry) => {
      if (String(entry.account_assigned_uuid || '').trim() || !String(entry.account_assigned || '').trim()) return entry;
      const resolved = resolveLegacyLedger(entry.account_assigned);
      if (!resolved) {
        diarySkipped += 1;
        return entry;
      }
      changed = true;
      diaryResolved += 1;
      return {
        ...entry,
        account_assigned_uuid: resolved.uuid,
        account_assigned_name: resolved.name,
        account_assigned_type: resolved.type,
      };
    });
    if (changed) await write(collections.diarydrafts, { _id: doc._id }, { $set: { entries } });
  }

  const statements = await collections.bankstatements.find({ 'entries.account_assigned': { $nin: [null, ''] } }).toArray();
  let bankResolved = 0;
  let bankSkipped = 0;
  for (const doc of statements) {
    let changed = false;
    const entries = (doc.entries || []).map((entry) => {
      if (String(entry.account_assigned_uuid || '').trim() || !String(entry.account_assigned || '').trim()) return entry;
      const resolved = resolveLegacyLedger(entry.account_assigned);
      if (!resolved) {
        bankSkipped += 1;
        return entry;
      }
      changed = true;
      bankResolved += 1;
      return {
        ...entry,
        account_assigned_uuid: resolved.uuid,
        account_assigned_name: resolved.name,
        account_assigned_type: resolved.type,
      };
    });
    if (changed) await write(collections.bankstatements, { _id: doc._id }, { $set: { entries } });
  }
  console.log(`\nDiary assignments resolvable: ${diaryResolved}; ambiguous/unresolved: ${diarySkipped}`);
  console.log(`Bank assignments resolvable : ${bankResolved}; ambiguous/unresolved: ${bankSkipped}`);
  stats.unresolved.diaryAssignments = diarySkipped;
  stats.unresolved.bankAssignments = bankSkipped;

  // -----------------------------------------------------------------------
  // 4) Attendance: UUID backfill is additive. Business_day is backfilled only
  // when exactly one attendance document exists for employee+business day.
  // Duplicate historical rows are preserved and reported.
  // -----------------------------------------------------------------------
  const attendances = await collections.attendances.find({}).toArray();
  const missingAttendanceUuid = attendances.filter((row) => !String(row.Attendance_uuid || '').trim());
  for (const row of missingAttendanceUuid) {
    await write(collections.attendances, { _id: row._id, $or: [{ Attendance_uuid: { $exists: false } }, { Attendance_uuid: '' }, { Attendance_uuid: null }] }, { $set: { Attendance_uuid: uuidv4() } });
  }

  const attendanceGroups = groupBy(attendances, (row) => {
    if (!row.Employee_uuid || !row.Date) return '';
    const date = new Date(row.Date);
    if (Number.isNaN(date.getTime())) return '';
    return `${row.Employee_uuid}|${businessDateString(date)}`;
  });
  const attendanceDupes = duplicateSummary(attendanceGroups, 'attendance employee+business-day', (r) => `${r.Attendance_Record_ID || ''}#${r._id}`);
  stats.unresolved.attendanceDuplicateDays = attendanceDupes.length;

  for (const [key, rows] of attendanceGroups.entries()) {
    if (!key || rows.length !== 1) continue;
    const row = rows[0];
    if (String(row.Business_day || '').trim()) continue;
    const day = key.slice(key.lastIndexOf('|') + 1);
    await write(collections.attendances, { _id: row._id, Business_day: { $exists: false } }, { $set: { Business_day: day } });
  }

  const attendanceIdGroups = groupBy(attendances, (row) => row.Attendance_Record_ID === undefined || row.Attendance_Record_ID === null ? '' : String(row.Attendance_Record_ID));
  const attendanceIdDupes = duplicateSummary(attendanceIdGroups, 'Attendance_Record_ID', (r) => `${r.Employee_uuid || ''}#${r._id}`);
  stats.unresolved.attendanceRecordIdDuplicates = attendanceIdDupes.length;

  // -----------------------------------------------------------------------
  // 5) Purchase order item UUID backfill by exact normalized unique item name.
  // -----------------------------------------------------------------------
  const items = await collections.items.find({}).toArray();
  const itemNameGroups = groupBy(items.filter((r) => r.Item_uuid), (row) => norm(row.Item_name));
  const purchaseOrders = await collections.purchaseorders.find({ 'Items.0': { $exists: true } }).toArray();
  let poResolved = 0;
  let poSkipped = 0;
  for (const po of purchaseOrders) {
    let changed = false;
    const poItems = (po.Items || []).map((item) => {
      if (String(item.itemUuid || '').trim()) return item;
      const matches = itemNameGroups.get(norm(item.itemName)) || [];
      if (matches.length !== 1) {
        if (item.itemName) poSkipped += 1;
        return item;
      }
      changed = true;
      poResolved += 1;
      return { ...item, itemUuid: matches[0].Item_uuid };
    });
    if (changed) await write(collections.purchaseorders, { _id: po._id }, { $set: { Items: poItems } });
  }
  console.log(`PO item UUIDs resolvable: ${poResolved}; ambiguous/unresolved: ${poSkipped}`);
  stats.unresolved.purchaseOrderItems = poSkipped;

  // -----------------------------------------------------------------------
  // 6) Transaction audit only. Never auto-repair journal identity or amounts.
  // -----------------------------------------------------------------------
  const transactions = await collections.transactions.find({}).toArray();
  const knownLedgerUuids = new Set([...accountByUuid.keys(), ...customerByUuid.keys()]);
  const badTransactions = [];
  for (const tx of transactions) {
    const issues = [];
    let debit = 0;
    let credit = 0;
    const lines = Array.isArray(tx.Journal_entry) ? tx.Journal_entry : [];
    if (lines.length < 2) issues.push('journal_has_fewer_than_2_lines');
    for (const [index, line] of lines.entries()) {
      const accountId = String(line?.Account_id || '').trim();
      const type = String(line?.Type || '').trim().toLowerCase();
      const amount = Number(line?.Amount);
      if (!isUuid(accountId)) issues.push(`line_${index}_account_not_uuid`);
      else if (!knownLedgerUuids.has(accountId)) issues.push(`line_${index}_orphan_account_uuid`);
      if (type !== 'debit' && type !== 'credit') issues.push(`line_${index}_invalid_type`);
      if (!Number.isFinite(amount) || amount <= 0) issues.push(`line_${index}_invalid_amount`);
      if (Number.isFinite(amount) && amount > 0) {
        if (type === 'debit') debit += amount;
        if (type === 'credit') credit += amount;
      }
    }
    const round2 = (n) => Number(Number(n || 0).toFixed(2));
    debit = round2(debit);
    credit = round2(credit);
    if (debit !== credit) issues.push('journal_unbalanced');
    if (round2(tx.Total_Debit) !== round2(tx.Total_Credit)) issues.push('header_totals_unbalanced');
    if (round2(tx.Total_Debit) !== debit || round2(tx.Total_Credit) !== credit) issues.push('header_totals_do_not_match_journal');
    if (issues.length) {
      badTransactions.push({
        id: String(tx._id),
        transactionUuid: tx.Transaction_uuid || '',
        transactionId: tx.Transaction_id,
        issues: [...new Set(issues)],
      });
    }
  }
  console.log(`\nTransactions with integrity issues: ${badTransactions.length}`);
  for (const tx of badTransactions.slice(0, 30)) {
    console.log(`  txn ${tx.transactionId || tx.transactionUuid || tx.id}: ${tx.issues.join(', ')}`);
  }
  stats.unresolved.transactionIntegrityIssues = badTransactions.length;

  // -----------------------------------------------------------------------
  // 7) New progressive indexes. They only cover rows carrying the new additive
  // keys, so unresolved historical duplicates remain preserved and unblocked.
  // -----------------------------------------------------------------------
  if (APPLY && CREATE_INDEXES) {
    await collections.accounts.createIndex(
      { Account_name_key: 1 },
      { unique: true, partialFilterExpression: { Account_name_key: { $type: 'string' } }, name: 'Account_name_key_unique' }
    );
    await collections.customers.createIndex(
      { Customer_identity_key: 1 },
      { unique: true, partialFilterExpression: { Customer_identity_key: { $type: 'string' } }, name: 'Customer_identity_key_unique' }
    );
    await collections.users.createIndex(
      { User_identity_key: 1 },
      { unique: true, partialFilterExpression: { User_identity_key: { $type: 'string' } }, name: 'User_identity_key_unique' }
    );
    await collections.users.createIndex({ Ledger_account_uuid: 1 }, { name: 'Ledger_account_uuid_1' });
    await collections.attendances.createIndex(
      { Employee_uuid: 1, Business_day: 1 },
      { unique: true, partialFilterExpression: { Business_day: { $type: 'string' } }, name: 'employee_business_day_unique' }
    );
    await collections.diarydrafts.createIndex({ 'entries.account_assigned_uuid': 1 }, { name: 'entries_account_assigned_uuid_1' });
    await collections.bankstatements.createIndex({ 'entries.account_assigned_uuid': 1 }, { name: 'entries_account_assigned_uuid_1' });
    await collections.purchaseorders.createIndex({ 'Items.itemUuid': 1 }, { name: 'Items_itemUuid_1' });
    console.log('\nCreated progressive integrity indexes.');
  }

  stats.skippedAmbiguous += diarySkipped + bankSkipped + poSkipped;
  console.log('\n--- SUMMARY ---');
  console.log(JSON.stringify(stats, null, 2));
  if (!APPLY) console.log('\nReport only: database was not modified.');
  else console.log(`\nSafe backfill complete. Modified documents: ${stats.writes}. No rows were deleted, merged, or renumbered.`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Schema integrity migration failed:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
