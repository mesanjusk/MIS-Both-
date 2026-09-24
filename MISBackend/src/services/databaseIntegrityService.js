const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { businessDateString } = require('../utils/businessDay');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_LIMIT = 12;

const norm = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const isUuid = (value) => UUID_RE.test(String(value || '').trim());
const round2 = (value) => Number(Number(value || 0).toFixed(2));

function groupBy(rows, getKey) {
  const map = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    const bucket = map.get(key) || [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function duplicateGroups(map) {
  return [...map.entries()].filter(([, rows]) => rows.length > 1);
}

function sample(values, formatter = (value) => String(value)) {
  return values.slice(0, SAMPLE_LIMIT).map(formatter);
}

function issue({ key, area, label, count, fixable = false, examples = [], detail = '' }) {
  if (!count) return null;
  return {
    key,
    area,
    label,
    count,
    fixable,
    status: fixable ? 'safe_fix' : 'manual_review',
    detail,
    examples: examples.slice(0, SAMPLE_LIMIT),
  };
}

function collections() {
  const db = mongoose.connection;
  if (db.readyState !== 1) throw new Error('Database is not connected');
  return {
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
}

function buildLedgerMaps(accounts, customers) {
  const accountByUuid = new Map();
  const customerByUuid = new Map();
  const nameMap = new Map();

  const addName = (name, candidate) => {
    const key = norm(name);
    if (!key || !candidate.uuid) return;
    const list = nameMap.get(key) || [];
    list.push(candidate);
    nameMap.set(key, list);
  };

  for (const row of accounts) {
    const uuid = String(row.Account_uuid || '').trim();
    if (uuid) accountByUuid.set(uuid, row);
    addName(row.Account_name, { uuid, name: row.Account_name || uuid, type: 'account' });
  }
  for (const row of customers) {
    const uuid = String(row.Customer_uuid || '').trim();
    if (uuid) customerByUuid.set(uuid, row);
    addName(row.Customer_name, { uuid, name: row.Customer_name || uuid, type: 'customer' });
  }

  const resolve = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (accountByUuid.has(raw) && !customerByUuid.has(raw)) {
      const row = accountByUuid.get(raw);
      return { uuid: raw, name: row.Account_name || raw, type: 'account' };
    }
    if (customerByUuid.has(raw) && !accountByUuid.has(raw)) {
      const row = customerByUuid.get(raw);
      return { uuid: raw, name: row.Customer_name || raw, type: 'customer' };
    }
    if (accountByUuid.has(raw) && customerByUuid.has(raw)) return null;

    const matches = (nameMap.get(norm(raw)) || []).filter((candidate) => candidate.uuid);
    const byUuid = new Map(matches.map((candidate) => [candidate.uuid, candidate]));
    return byUuid.size === 1 ? [...byUuid.values()][0] : null;
  };

  return { accountByUuid, customerByUuid, nameMap, resolve };
}

async function readSnapshot() {
  const c = collections();
  const [accounts, customers, users, attendances, diaries, statements, purchaseOrders, items, transactions] = await Promise.all([
    c.accounts.find({}).toArray(),
    c.customers.find({}).toArray(),
    c.users.find({}).toArray(),
    c.attendances.find({}).toArray(),
    c.diarydrafts.find({}).toArray(),
    c.bankstatements.find({}).toArray(),
    c.purchaseorders.find({}).toArray(),
    c.items.find({}).toArray(),
    c.transactions.find({}).toArray(),
  ]);
  return { c, accounts, customers, users, attendances, diaries, statements, purchaseOrders, items, transactions };
}

function analyzeSnapshot(snapshot) {
  const {
    accounts,
    customers,
    users,
    attendances,
    diaries,
    statements,
    purchaseOrders,
    items,
    transactions,
  } = snapshot;

  const issues = [];
  const add = (row) => { if (row) issues.push(row); };

  const missingCustomers = customers.filter((row) => !String(row.Customer_uuid || '').trim());
  const missingUsers = users.filter((row) => !String(row.User_uuid || '').trim());
  add(issue({
    key: 'missing_customer_uuid', area: 'Customers', label: 'Customers missing UUID',
    count: missingCustomers.length, fixable: true,
    examples: sample(missingCustomers, (row) => row.Customer_name || String(row._id)),
    detail: 'A UUID can be added without changing the customer record or any existing value.',
  }));
  add(issue({
    key: 'missing_user_uuid', area: 'Users', label: 'Users missing UUID',
    count: missingUsers.length, fixable: true,
    examples: sample(missingUsers, (row) => row.User_name || row.name || String(row._id)),
    detail: 'A UUID can be added without changing the user record or any existing value.',
  }));

  const customerUuidGroups = groupBy(customers, (row) => String(row.Customer_uuid || '').trim());
  const userUuidGroups = groupBy(users, (row) => String(row.User_uuid || '').trim());
  const customerUuidDupes = duplicateGroups(customerUuidGroups);
  const userUuidDupes = duplicateGroups(userUuidGroups);
  add(issue({
    key: 'duplicate_customer_uuid', area: 'Customers', label: 'Duplicate customer UUID groups',
    count: customerUuidDupes.length,
    examples: sample(customerUuidDupes, ([key, rows]) => `${key} (${rows.map((r) => r.Customer_name || r._id).join(', ')})`),
    detail: 'Duplicates are never merged automatically.',
  }));
  add(issue({
    key: 'duplicate_user_uuid', area: 'Users', label: 'Duplicate user UUID groups',
    count: userUuidDupes.length,
    examples: sample(userUuidDupes, ([key, rows]) => `${key} (${rows.map((r) => r.User_name || r._id).join(', ')})`),
    detail: 'Duplicates are never merged automatically.',
  }));

  const customerIdentityFixable = [...customerUuidGroups.entries()].filter(([, rows]) => rows.length === 1 && !String(rows[0].Customer_identity_key || '').trim());
  const userIdentityFixable = [...userUuidGroups.entries()].filter(([, rows]) => rows.length === 1 && !String(rows[0].User_identity_key || '').trim());
  add(issue({
    key: 'missing_customer_identity_key', area: 'Customers', label: 'Customer identity keys to backfill',
    count: customerIdentityFixable.length, fixable: true,
    examples: sample(customerIdentityFixable, ([uuid, rows]) => `${rows[0].Customer_name || 'Customer'} → ${uuid}`),
    detail: 'Only UUIDs used by exactly one customer are keyed.',
  }));
  add(issue({
    key: 'missing_user_identity_key', area: 'Users', label: 'User identity keys to backfill',
    count: userIdentityFixable.length, fixable: true,
    examples: sample(userIdentityFixable, ([uuid, rows]) => `${rows[0].User_name || 'User'} → ${uuid}`),
    detail: 'Only UUIDs used by exactly one user are keyed.',
  }));

  const accountNameGroups = groupBy(accounts, (row) => norm(row.Account_name));
  const accountNameDupes = duplicateGroups(accountNameGroups);
  const accountNameKeyFixable = [...accountNameGroups.entries()].filter(([, rows]) => rows.length === 1 && !String(rows[0].Account_name_key || '').trim());
  add(issue({
    key: 'duplicate_account_name', area: 'Accounts', label: 'Duplicate normalized account names',
    count: accountNameDupes.length,
    examples: sample(accountNameDupes, ([key, rows]) => `${key} (${rows.length} records)`),
    detail: 'Same-name accounts require manual review; Safe Fix does not choose one.',
  }));
  add(issue({
    key: 'missing_account_name_key', area: 'Accounts', label: 'Unique account names to protect',
    count: accountNameKeyFixable.length, fixable: true,
    examples: sample(accountNameKeyFixable, ([key, rows]) => `${rows[0].Account_name || key}`),
    detail: 'Only historically unique account names get the normalized integrity key.',
  }));

  const accountCodeGroups = groupBy(accounts, (row) => row.Account_code === undefined || row.Account_code === null ? '' : String(row.Account_code));
  const accountCodeDupes = duplicateGroups(accountCodeGroups);
  add(issue({
    key: 'duplicate_account_code', area: 'Accounts', label: 'Duplicate account codes',
    count: accountCodeDupes.length,
    examples: sample(accountCodeDupes, ([code, rows]) => `${code} (${rows.map((r) => r.Account_name || r._id).join(', ')})`),
    detail: 'Account codes are not renumbered automatically.',
  }));

  const ledgerMaps = buildLedgerMaps(accounts, customers);
  const staffResolvable = [];
  const staffUnresolved = [];
  for (const row of users) {
    if (String(row.Ledger_account_uuid || '').trim()) continue;
    const raw = String(row.AccountID || '').trim();
    if (!raw) continue;
    const resolved = ledgerMaps.resolve(raw);
    (resolved ? staffResolvable : staffUnresolved).push({ row, raw, resolved });
  }
  add(issue({
    key: 'staff_ledger_resolvable', area: 'Users', label: 'Staff ledger mappings to backfill',
    count: staffResolvable.length, fixable: true,
    examples: sample(staffResolvable, ({ row, resolved }) => `${row.User_name || row.name || row._id} → ${resolved.name}`),
    detail: 'Safe Fix writes only a uniquely verified existing ledger UUID.',
  }));
  add(issue({
    key: 'staff_ledger_unresolved', area: 'Users', label: 'Staff ledger mappings unresolved',
    count: staffUnresolved.length,
    examples: sample(staffUnresolved, ({ row, raw }) => `${row.User_name || row.name || row._id}: ${raw}`),
    detail: 'Ambiguous or missing ledgers are left unchanged.',
  }));

  const analyzeEmbeddedAssignments = (docs, area) => {
    const resolvable = [];
    const unresolved = [];
    for (const doc of docs) {
      for (const [index, entry] of (doc.entries || []).entries()) {
        if (String(entry.account_assigned_uuid || '').trim()) continue;
        const legacy = String(entry.account_assigned || '').trim();
        if (!legacy) continue;
        const resolved = ledgerMaps.resolve(legacy);
        const item = { doc, index, entry, legacy, resolved };
        (resolved ? resolvable : unresolved).push(item);
      }
    }
    add(issue({
      key: `${area}_assignment_resolvable`, area: area === 'diary' ? 'Diary' : 'Bank Statements',
      label: `${area === 'diary' ? 'Diary' : 'Bank'} assignments to convert to UUID`,
      count: resolvable.length, fixable: true,
      examples: sample(resolvable, ({ legacy, resolved }) => `${legacy} → ${resolved.name}`),
      detail: 'Legacy display names are retained; canonical UUID/type fields are added only on unique matches.',
    }));
    add(issue({
      key: `${area}_assignment_unresolved`, area: area === 'diary' ? 'Diary' : 'Bank Statements',
      label: `${area === 'diary' ? 'Diary' : 'Bank'} assignments unresolved`,
      count: unresolved.length,
      examples: sample(unresolved, ({ legacy }) => legacy),
      detail: 'Ambiguous names are never guessed.',
    }));
    return { resolvable, unresolved };
  };
  const diaryAssignments = analyzeEmbeddedAssignments(diaries, 'diary');
  const bankAssignments = analyzeEmbeddedAssignments(statements, 'bank');

  const missingAttendanceUuid = attendances.filter((row) => !String(row.Attendance_uuid || '').trim());
  add(issue({
    key: 'attendance_missing_uuid', area: 'Attendance', label: 'Attendance rows missing UUID',
    count: missingAttendanceUuid.length, fixable: true,
    examples: sample(missingAttendanceUuid, (row) => `${row.Employee_uuid || 'Unknown'} / ${row.Date || ''}`),
  }));

  const attendanceDayGroups = groupBy(attendances, (row) => {
    if (!row.Employee_uuid || !row.Date) return '';
    const date = new Date(row.Date);
    if (Number.isNaN(date.getTime())) return '';
    return `${row.Employee_uuid}|${businessDateString(date)}`;
  });
  const attendanceDayDupes = duplicateGroups(attendanceDayGroups);
  const attendanceDayFixable = [...attendanceDayGroups.entries()].filter(([, rows]) => rows.length === 1 && !String(rows[0].Business_day || '').trim());
  add(issue({
    key: 'attendance_duplicate_day', area: 'Attendance', label: 'Duplicate employee/day attendance groups',
    count: attendanceDayDupes.length,
    examples: sample(attendanceDayDupes, ([key, rows]) => `${key} (${rows.length} records)`),
    detail: 'Existing duplicate attendance rows are preserved for manual review.',
  }));
  add(issue({
    key: 'attendance_day_backfill', area: 'Attendance', label: 'Attendance business-day keys to backfill',
    count: attendanceDayFixable.length, fixable: true,
    examples: sample(attendanceDayFixable, ([key]) => key),
    detail: 'Only employee/day combinations that have exactly one historical row are keyed.',
  }));

  const attendanceIdGroups = groupBy(attendances, (row) => row.Attendance_Record_ID === undefined || row.Attendance_Record_ID === null ? '' : String(row.Attendance_Record_ID));
  const attendanceIdDupes = duplicateGroups(attendanceIdGroups);
  add(issue({
    key: 'attendance_duplicate_record_id', area: 'Attendance', label: 'Duplicate attendance record numbers',
    count: attendanceIdDupes.length,
    examples: sample(attendanceIdDupes, ([id, rows]) => `${id} (${rows.length} records)`),
    detail: 'Historical record numbers are never renumbered automatically.',
  }));

  const itemNameGroups = groupBy(items.filter((row) => String(row.Item_uuid || '').trim()), (row) => norm(row.Item_name));
  const poResolvable = [];
  const poUnresolved = [];
  for (const po of purchaseOrders) {
    for (const [index, item] of (po.Items || []).entries()) {
      if (String(item.itemUuid || '').trim() || !String(item.itemName || '').trim()) continue;
      const matches = itemNameGroups.get(norm(item.itemName)) || [];
      const payload = { po, index, item, matches };
      (matches.length === 1 ? poResolvable : poUnresolved).push(payload);
    }
  }
  add(issue({
    key: 'po_item_resolvable', area: 'Purchase Orders', label: 'PO lines missing catalog UUID',
    count: poResolvable.length, fixable: true,
    examples: sample(poResolvable, ({ po, item }) => `${po.PO_Number || po.PO_uuid || po._id}: ${item.itemName}`),
    detail: 'Only an exact normalized name with one catalog match is linked.',
  }));
  add(issue({
    key: 'po_item_unresolved', area: 'Purchase Orders', label: 'PO lines with ambiguous/missing catalog match',
    count: poUnresolved.length,
    examples: sample(poUnresolved, ({ po, item }) => `${po.PO_Number || po.PO_uuid || po._id}: ${item.itemName}`),
    detail: 'No catalog item is guessed.',
  }));

  const knownLedgerUuids = new Set([
    ...ledgerMaps.accountByUuid.keys(),
    ...ledgerMaps.customerByUuid.keys(),
  ]);
  const badTransactions = [];
  for (const tx of transactions) {
    const txIssues = [];
    const lines = Array.isArray(tx.Journal_entry) ? tx.Journal_entry : [];
    let debit = 0;
    let credit = 0;
    if (lines.length < 2) txIssues.push('fewer than 2 journal lines');
    for (const [index, line] of lines.entries()) {
      const accountId = String(line?.Account_id || '').trim();
      const type = String(line?.Type || '').trim().toLowerCase();
      const amount = Number(line?.Amount);
      if (!isUuid(accountId)) txIssues.push(`line ${index + 1}: account is not UUID`);
      else if (!knownLedgerUuids.has(accountId)) txIssues.push(`line ${index + 1}: orphan account UUID`);
      if (type !== 'debit' && type !== 'credit') txIssues.push(`line ${index + 1}: invalid debit/credit type`);
      if (!Number.isFinite(amount) || amount <= 0) txIssues.push(`line ${index + 1}: invalid amount`);
      if (Number.isFinite(amount) && amount > 0) {
        if (type === 'debit') debit += amount;
        if (type === 'credit') credit += amount;
      }
    }
    debit = round2(debit);
    credit = round2(credit);
    if (debit !== credit) txIssues.push('journal is unbalanced');
    if (round2(tx.Total_Debit) !== round2(tx.Total_Credit)) txIssues.push('header totals are unbalanced');
    if (round2(tx.Total_Debit) !== debit || round2(tx.Total_Credit) !== credit) txIssues.push('header totals do not match journal');
    if (txIssues.length) {
      badTransactions.push({
        id: tx.Transaction_id || tx.Transaction_uuid || String(tx._id),
        issues: [...new Set(txIssues)],
      });
    }
  }
  add(issue({
    key: 'transaction_integrity', area: 'Transactions', label: 'Transactions requiring accounting review',
    count: badTransactions.length,
    examples: sample(badTransactions, (row) => `${row.id}: ${row.issues.join('; ')}`),
    detail: 'Safe Fix never edits journal accounts, amounts or totals.',
  }));

  const safeFixable = issues.filter((row) => row.fixable).reduce((sum, row) => sum + row.count, 0);
  const manualReview = issues.filter((row) => !row.fixable).reduce((sum, row) => sum + row.count, 0);
  const totalIssues = issues.reduce((sum, row) => sum + row.count, 0);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalIssues,
      safeFixable,
      manualReview,
      categories: issues.length,
      transactionIssues: badTransactions.length,
    },
    issues,
    internal: {
      customerUuidGroups,
      userUuidGroups,
      accountNameGroups,
      ledgerMaps,
      staffResolvable,
      diaryAssignments,
      bankAssignments,
      attendanceDayGroups,
      poResolvable,
    },
  };
}

function publicReport(analysis) {
  return {
    generatedAt: analysis.generatedAt,
    summary: analysis.summary,
    issues: analysis.issues,
    safety: {
      deletes: false,
      merges: false,
      renumbers: false,
      transactionJournalWrites: false,
      ambiguousMatchesSkipped: true,
    },
  };
}

async function auditDatabaseIntegrity() {
  const snapshot = await readSnapshot();
  return publicReport(analyzeSnapshot(snapshot));
}

async function applySafeIntegrityFixes() {
  let snapshot = await readSnapshot();
  let analysis = analyzeSnapshot(snapshot);
  const c = snapshot.c;
  const changes = {};
  let totalChanged = 0;

  const bump = (key, value = 1) => {
    if (!value) return;
    changes[key] = (changes[key] || 0) + value;
    totalChanged += value;
  };

  // Missing UUIDs are additive: no existing relationship could point at an
  // absent UUID. The conditional filter makes this safe to repeat.
  for (const row of snapshot.customers) {
    if (String(row.Customer_uuid || '').trim()) continue;
    const result = await c.customers.updateOne(
      { _id: row._id, $or: [{ Customer_uuid: { $exists: false } }, { Customer_uuid: '' }, { Customer_uuid: null }] },
      { $set: { Customer_uuid: uuidv4() } }
    );
    bump('customerUuidAdded', result.modifiedCount);
  }
  for (const row of snapshot.users) {
    if (String(row.User_uuid || '').trim()) continue;
    const result = await c.users.updateOne(
      { _id: row._id, $or: [{ User_uuid: { $exists: false } }, { User_uuid: '' }, { User_uuid: null }] },
      { $set: { User_uuid: uuidv4() } }
    );
    bump('userUuidAdded', result.modifiedCount);
  }

  // Re-read after generating UUIDs so identity-key uniqueness is decided on
  // the actual stored values, never on a stale in-memory snapshot.
  snapshot = await readSnapshot();
  analysis = analyzeSnapshot(snapshot);

  for (const [uuid, rows] of analysis.internal.customerUuidGroups.entries()) {
    if (!uuid || rows.length !== 1 || String(rows[0].Customer_identity_key || '').trim()) continue;
    const result = await c.customers.updateOne(
      { _id: rows[0]._id, $or: [{ Customer_identity_key: { $exists: false } }, { Customer_identity_key: '' }, { Customer_identity_key: null }] },
      { $set: { Customer_identity_key: uuid } }
    );
    bump('customerIdentityKeysAdded', result.modifiedCount);
  }
  for (const [uuid, rows] of analysis.internal.userUuidGroups.entries()) {
    if (!uuid || rows.length !== 1 || String(rows[0].User_identity_key || '').trim()) continue;
    const result = await c.users.updateOne(
      { _id: rows[0]._id, $or: [{ User_identity_key: { $exists: false } }, { User_identity_key: '' }, { User_identity_key: null }] },
      { $set: { User_identity_key: uuid } }
    );
    bump('userIdentityKeysAdded', result.modifiedCount);
  }
  for (const [nameKey, rows] of analysis.internal.accountNameGroups.entries()) {
    if (!nameKey || rows.length !== 1 || String(rows[0].Account_name_key || '').trim()) continue;
    const result = await c.accounts.updateOne(
      { _id: rows[0]._id, $or: [{ Account_name_key: { $exists: false } }, { Account_name_key: '' }, { Account_name_key: null }] },
      { $set: { Account_name_key: nameKey } }
    );
    bump('accountNameKeysAdded', result.modifiedCount);
  }

  for (const { row, resolved } of analysis.internal.staffResolvable) {
    const result = await c.users.updateOne(
      { _id: row._id, $or: [{ Ledger_account_uuid: { $exists: false } }, { Ledger_account_uuid: '' }, { Ledger_account_uuid: null }] },
      { $set: { Ledger_account_uuid: resolved.uuid } }
    );
    bump('staffLedgerUuidsAdded', result.modifiedCount);
  }

  const applyEmbeddedAssignments = async (collection, resolvable, changeKey) => {
    const byDoc = new Map();
    for (const item of resolvable) {
      const id = String(item.doc._id);
      const bucket = byDoc.get(id) || { doc: item.doc, set: {} };
      bucket.set[`entries.${item.index}.account_assigned_uuid`] = item.resolved.uuid;
      bucket.set[`entries.${item.index}.account_assigned_name`] = item.resolved.name;
      bucket.set[`entries.${item.index}.account_assigned_type`] = item.resolved.type;
      byDoc.set(id, bucket);
    }
    for (const { doc, set } of byDoc.values()) {
      const result = await collection.updateOne({ _id: doc._id }, { $set: set });
      if (result.modifiedCount) bump(changeKey, Object.keys(set).length / 3);
    }
  };
  await applyEmbeddedAssignments(c.diarydrafts, analysis.internal.diaryAssignments.resolvable, 'diaryAssignmentsLinked');
  await applyEmbeddedAssignments(c.bankstatements, analysis.internal.bankAssignments.resolvable, 'bankAssignmentsLinked');

  for (const row of snapshot.attendances) {
    if (!String(row.Attendance_uuid || '').trim()) {
      const result = await c.attendances.updateOne(
        { _id: row._id, $or: [{ Attendance_uuid: { $exists: false } }, { Attendance_uuid: '' }, { Attendance_uuid: null }] },
        { $set: { Attendance_uuid: uuidv4() } }
      );
      bump('attendanceUuidsAdded', result.modifiedCount);
    }
  }
  for (const [key, rows] of analysis.internal.attendanceDayGroups.entries()) {
    if (!key || rows.length !== 1 || String(rows[0].Business_day || '').trim()) continue;
    const businessDay = key.slice(key.lastIndexOf('|') + 1);
    const result = await c.attendances.updateOne(
      { _id: rows[0]._id, $or: [{ Business_day: { $exists: false } }, { Business_day: '' }, { Business_day: null }] },
      { $set: { Business_day: businessDay } }
    );
    bump('attendanceBusinessDaysAdded', result.modifiedCount);
  }

  const poByDoc = new Map();
  for (const { po, index, matches } of analysis.internal.poResolvable) {
    const id = String(po._id);
    const bucket = poByDoc.get(id) || { po, set: {} };
    bucket.set[`Items.${index}.itemUuid`] = matches[0].Item_uuid;
    poByDoc.set(id, bucket);
  }
  for (const { po, set } of poByDoc.values()) {
    const result = await c.purchaseorders.updateOne({ _id: po._id }, { $set: set });
    if (result.modifiedCount) bump('purchaseOrderItemUuidsAdded', Object.keys(set).length);
  }

  const after = await auditDatabaseIntegrity();
  return {
    changed: totalChanged,
    changes,
    report: after,
    safety: {
      deleted: 0,
      merged: 0,
      renumbered: 0,
      transactionJournalsChanged: 0,
    },
  };
}

module.exports = {
  auditDatabaseIntegrity,
  applySafeIntegrityFixes,
};
