const mongoose = require('mongoose');
const TransactionAudit = require('../repositories/transactionAudit');
const { businessDateString } = require('../utils/businessDay');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const isUuid = (value) => UUID_RE.test(String(value || '').trim());
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toObjectId = (value) => mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

function db() {
  if (mongoose.connection.readyState !== 1) throw new Error('Database is not connected');
  return mongoose.connection.db;
}

function collections() {
  const database = db();
  return {
    accounts: database.collection('accounts'),
    customers: database.collection('customers'),
    users: database.collection('users'),
    attendances: database.collection('attendances'),
    diarydrafts: database.collection('diarydrafts'),
    bankstatements: database.collection('bankstatements'),
    purchaseorders: database.collection('purchaseorders'),
    items: database.collection('items'),
    transactions: database.collection('transactions'),
  };
}

async function ledgerCatalog() {
  const c = collections();
  const [accounts, customers] = await Promise.all([
    c.accounts.find({}, { projection: { Account_uuid: 1, Account_name: 1, Account_code: 1, Account_type: 1 } }).toArray(),
    c.customers.find({}, { projection: { Customer_uuid: 1, Customer_name: 1, Customer_group: 1 } }).toArray(),
  ]);
  const rows = [];
  for (const row of accounts) {
    if (!isUuid(row.Account_uuid)) continue;
    rows.push({ uuid: row.Account_uuid, name: row.Account_name || row.Account_uuid, type: 'account', code: row.Account_code ?? '' });
  }
  for (const row of customers) {
    if (!isUuid(row.Customer_uuid)) continue;
    rows.push({ uuid: row.Customer_uuid, name: row.Customer_name || row.Customer_uuid, type: 'customer', code: row.Customer_group || '' });
  }
  return rows;
}

async function ledgerByUuid(uuid) {
  if (!isUuid(uuid)) return null;
  const c = collections();
  const [account, customer] = await Promise.all([
    c.accounts.findOne({ Account_uuid: uuid }, { projection: { Account_uuid: 1, Account_name: 1, Account_code: 1 } }),
    c.customers.findOne({ Customer_uuid: uuid }, { projection: { Customer_uuid: 1, Customer_name: 1, Customer_group: 1 } }),
  ]);
  if (account && customer) return null;
  if (account) return { uuid, name: account.Account_name || uuid, type: 'account', code: account.Account_code ?? '' };
  if (customer) return { uuid, name: customer.Customer_name || uuid, type: 'customer', code: customer.Customer_group || '' };
  return null;
}

async function searchLedgerOptions(query = '', limit = 40) {
  const rows = await ledgerCatalog();
  const q = norm(query);
  const filtered = q
    ? rows.filter((row) => norm(row.name).includes(q) || norm(row.uuid).includes(q) || norm(row.code).includes(q))
    : rows;
  return filtered.slice(0, Math.max(1, Math.min(100, Number(limit) || 40)));
}

async function searchItemOptions(query = '', limit = 40) {
  const c = collections();
  const q = String(query || '').trim();
  const filter = q ? { Item_name: { $regex: escapeRegex(q), $options: 'i' } } : {};
  const rows = await c.items.find(filter, { projection: { Item_uuid: 1, Item_name: 1, Item_group: 1 } })
    .limit(Math.max(1, Math.min(100, Number(limit) || 40))).toArray();
  return rows.filter((row) => isUuid(row.Item_uuid)).map((row) => ({ uuid: row.Item_uuid, name: row.Item_name || row.Item_uuid, group: row.Item_group || '' }));
}

async function getUnresolvedAssignmentGroups(collectionName) {
  const c = collections();
  const docs = await c[collectionName].find({ entries: { $exists: true, $ne: [] } }).toArray();
  const ledgers = await ledgerCatalog();
  const nameMap = new Map();
  for (const ledger of ledgers) {
    const key = norm(ledger.name);
    const list = nameMap.get(key) || [];
    list.push(ledger);
    nameMap.set(key, list);
  }
  const groups = new Map();
  for (const doc of docs) {
    for (const [index, entry] of (doc.entries || []).entries()) {
      if (String(entry.account_assigned_uuid || '').trim()) continue;
      const legacy = String(entry.account_assigned || '').trim();
      if (!legacy) continue;
      const matches = nameMap.get(norm(legacy)) || [];
      const unique = new Map(matches.map((row) => [row.uuid, row]));
      if (unique.size === 1) continue;
      const key = norm(legacy);
      const group = groups.get(key) || { key, label: legacy, affectedCount: 0, refs: [], examples: [] };
      group.affectedCount += 1;
      group.refs.push({ docId: String(doc._id), index, legacy });
      if (group.examples.length < 5) {
        group.examples.push({
          document: doc.diary_uuid || doc.statement_uuid || String(doc._id),
          description: entry.party || entry.description || entry.reference || '',
          amount: Number(entry.amount || entry.debit || entry.credit || 0),
        });
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.affectedCount - a.affectedCount || a.label.localeCompare(b.label));
}

async function getPoGroups() {
  const c = collections();
  const [pos, items] = await Promise.all([
    c.purchaseorders.find({ Items: { $exists: true, $ne: [] } }).toArray(),
    c.items.find({}, { projection: { Item_uuid: 1, Item_name: 1 } }).toArray(),
  ]);
  const byName = new Map();
  for (const item of items) {
    if (!isUuid(item.Item_uuid)) continue;
    const key = norm(item.Item_name);
    const list = byName.get(key) || [];
    list.push(item);
    byName.set(key, list);
  }
  const groups = new Map();
  for (const po of pos) {
    for (const [index, item] of (po.Items || []).entries()) {
      if (String(item.itemUuid || '').trim() || !String(item.itemName || '').trim()) continue;
      const matches = byName.get(norm(item.itemName)) || [];
      if (matches.length === 1) continue;
      const key = norm(item.itemName);
      const group = groups.get(key) || { key, label: item.itemName, affectedCount: 0, refs: [], examples: [] };
      group.affectedCount += 1;
      group.refs.push({ poId: String(po._id), index, itemName: item.itemName });
      if (group.examples.length < 5) {
        group.examples.push({ po: po.PO_Number || po.PO_uuid || String(po._id), qty: item.qty ?? '', rate: item.rate ?? '', amount: item.amount ?? '' });
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.affectedCount - a.affectedCount || a.label.localeCompare(b.label));
}

async function getAttendanceDuplicateGroups() {
  const c = collections();
  const [rows, users] = await Promise.all([
    c.attendances.find({ Employee_uuid: { $exists: true }, Date: { $exists: true } }).toArray(),
    c.users.find({}, { projection: { User_uuid: 1, User_name: 1, name: 1 } }).toArray(),
  ]);
  const userNames = new Map(users.map((row) => [String(row.User_uuid || ''), row.User_name || row.name || row.User_uuid]));
  const map = new Map();
  for (const row of rows) {
    const date = new Date(row.Date);
    if (!row.Employee_uuid || Number.isNaN(date.getTime())) continue;
    const day = businessDateString(date);
    const key = `${row.Employee_uuid}|${day}`;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1).map(([key, list]) => {
    const [employeeUuid, day] = key.split('|');
    return {
      key,
      label: `${userNames.get(employeeUuid) || employeeUuid} — ${day}`,
      affectedCount: list.length,
      employeeUuid,
      employeeName: userNames.get(employeeUuid) || employeeUuid,
      day,
      records: list.map((row) => ({
        id: String(row._id),
        attendanceUuid: row.Attendance_uuid || '',
        recordId: row.Attendance_Record_ID ?? '',
        status: row.Status || '',
        source: row.Source || '',
        date: row.Date,
        businessDay: row.Business_day || '',
        punches: Array.isArray(row.User) ? row.User.map((p) => ({ time: p.Time || '', type: p.Type || '', source: p.SourceCommand || '' })) : [],
      })),
    };
  }).sort((a, b) => a.day.localeCompare(b.day) || a.employeeName.localeCompare(b.employeeName));
}

function transactionIssues(tx, knownLedgerUuids) {
  const issues = [];
  const orphanLines = [];
  const lines = Array.isArray(tx.Journal_entry) ? tx.Journal_entry : [];
  let debit = 0;
  let credit = 0;
  if (lines.length < 2) issues.push('fewer than 2 journal lines');
  lines.forEach((line, index) => {
    const accountId = String(line?.Account_id || '').trim();
    const type = String(line?.Type || '').trim().toLowerCase();
    const amount = Number(line?.Amount);
    if (!isUuid(accountId)) {
      issues.push(`line ${index + 1}: account is not UUID`);
      orphanLines.push({ index, accountId, accountName: line?.Account_name || '', type: line?.Type || '', amount: line?.Amount ?? '' });
    } else if (!knownLedgerUuids.has(accountId)) {
      issues.push(`line ${index + 1}: orphan account UUID`);
      orphanLines.push({ index, accountId, accountName: line?.Account_name || '', type: line?.Type || '', amount: line?.Amount ?? '' });
    }
    if (type !== 'debit' && type !== 'credit') issues.push(`line ${index + 1}: invalid debit/credit type`);
    if (!Number.isFinite(amount) || amount <= 0) issues.push(`line ${index + 1}: invalid amount`);
    if (Number.isFinite(amount) && amount > 0) {
      if (type === 'debit') debit += amount;
      if (type === 'credit') credit += amount;
    }
  });
  const round = (v) => Number(Number(v || 0).toFixed(2));
  debit = round(debit); credit = round(credit);
  if (debit !== credit) issues.push('journal is unbalanced');
  if (round(tx.Total_Debit) !== round(tx.Total_Credit)) issues.push('header totals are unbalanced');
  if (round(tx.Total_Debit) !== debit || round(tx.Total_Credit) !== credit) issues.push('header totals do not match journal');
  return { issues: [...new Set(issues)], orphanLines };
}

async function getTransactionReviewRows() {
  const c = collections();
  const [transactions, ledgers] = await Promise.all([c.transactions.find({}).toArray(), ledgerCatalog()]);
  const known = new Set(ledgers.map((row) => row.uuid));
  return transactions.map((tx) => {
    const result = transactionIssues(tx, known);
    if (!result.issues.length) return null;
    return {
      id: String(tx._id),
      label: `Transaction ${tx.Transaction_id || tx.Transaction_uuid || tx._id}`,
      transactionId: tx.Transaction_id ?? '',
      transactionUuid: tx.Transaction_uuid || '',
      date: tx.Transaction_date || '',
      description: tx.Description || '',
      totalDebit: tx.Total_Debit ?? '',
      totalCredit: tx.Total_Credit ?? '',
      issues: result.issues,
      orphanLines: result.orphanLines,
      affectedCount: 1,
    };
  }).filter(Boolean);
}

async function getDuplicateAccountCodeGroups() {
  const c = collections();
  const rows = await c.accounts.find({ Account_code: { $exists: true, $ne: null } }).toArray();
  const map = new Map();
  for (const row of rows) {
    const key = String(row.Account_code ?? '').trim();
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1).map(([code, list]) => ({
    key: code,
    label: `Code ${code}`,
    affectedCount: list.length,
    accounts: list.map((row) => ({ id: String(row._id), uuid: row.Account_uuid || '', name: row.Account_name || '', code: row.Account_code ?? '', type: row.Account_type || '' })),
  }));
}

async function getStaffUnresolvedRows() {
  const c = collections();
  const [users, ledgers] = await Promise.all([
    c.users.find({}).toArray(),
    ledgerCatalog(),
  ]);
  const nameMap = new Map();
  const uuidMap = new Map();
  for (const ledger of ledgers) {
    uuidMap.set(ledger.uuid, ledger);
    const key = norm(ledger.name);
    const list = nameMap.get(key) || [];
    list.push(ledger);
    nameMap.set(key, list);
  }
  return users.filter((row) => {
    if (String(row.Ledger_account_uuid || '').trim()) return false;
    const raw = String(row.AccountID || '').trim();
    if (!raw) return false;
    if (uuidMap.has(raw)) return false;
    const unique = new Map((nameMap.get(norm(raw)) || []).map((entry) => [entry.uuid, entry]));
    return unique.size !== 1;
  }).map((row) => ({
    id: String(row._id),
    label: row.User_name || row.name || String(row._id),
    userUuid: row.User_uuid || '',
    currentAccountId: row.AccountID || '',
    affectedCount: 1,
  }));
}

const categoryLoaders = {
  duplicate_account_code: getDuplicateAccountCodeGroups,
  staff_ledger_unresolved: getStaffUnresolvedRows,
  diary_assignment_unresolved: () => getUnresolvedAssignmentGroups('diarydrafts'),
  bank_assignment_unresolved: () => getUnresolvedAssignmentGroups('bankstatements'),
  attendance_duplicate_day: getAttendanceDuplicateGroups,
  po_item_unresolved: getPoGroups,
  transaction_integrity: getTransactionReviewRows,
};

const categoryMeta = {
  duplicate_account_code: { title: 'Duplicate account codes', resolver: 'account_code', destructive: false },
  staff_ledger_unresolved: { title: 'Staff ledger mappings', resolver: 'ledger', destructive: false },
  diary_assignment_unresolved: { title: 'Diary assignment groups', resolver: 'ledger_group', destructive: false },
  bank_assignment_unresolved: { title: 'Bank assignment groups', resolver: 'ledger_group', destructive: false },
  attendance_duplicate_day: { title: 'Duplicate attendance days', resolver: null, destructive: true, note: 'Inspect only. No merge/delete action is exposed.' },
  po_item_unresolved: { title: 'PO item mapping groups', resolver: 'item_group', destructive: false },
  transaction_integrity: { title: 'Transaction accounting review', resolver: 'transaction_ledger', destructive: false },
};

async function listManualReview(category, { page = 1, limit = 25, search = '' } = {}) {
  const loader = categoryLoaders[category];
  if (!loader) throw Object.assign(new Error('Unsupported manual-review category'), { statusCode: 400 });
  const meta = categoryMeta[category];
  let rows = await loader();
  const q = norm(search);
  if (q) rows = rows.filter((row) => norm(JSON.stringify(row)).includes(q));
  const total = rows.length;
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * safeLimit;
  return {
    category,
    ...meta,
    page: safePage,
    limit: safeLimit,
    total,
    records: rows.slice(start, start + safeLimit),
  };
}

async function resolveManualReview(category, payload, actorInfo = {}) {
  if (payload?.confirm !== true) throw Object.assign(new Error('Explicit confirmation is required'), { statusCode: 400 });
  const c = collections();
  const actor = actorInfo.actor || 'admin';
  const actorId = actorInfo.actorId || '';

  if (category === 'duplicate_account_code') {
    const accountId = toObjectId(payload.accountId);
    const newCodeRaw = String(payload.newCode ?? '').trim();
    if (!accountId || !newCodeRaw) throw Object.assign(new Error('Account and new code are required'), { statusCode: 400 });
    const target = await c.accounts.findOne({ _id: accountId });
    if (!target) throw Object.assign(new Error('Account not found'), { statusCode: 404 });
    const newCode = typeof target.Account_code === 'number' && /^\d+$/.test(newCodeRaw) ? Number(newCodeRaw) : newCodeRaw;
    const existing = await c.accounts.findOne({ Account_code: newCode, _id: { $ne: accountId } });
    if (existing) throw Object.assign(new Error(`Account code ${newCodeRaw} is already in use by ${existing.Account_name || 'another account'}`), { statusCode: 409 });
    const result = await c.accounts.updateOne({ _id: accountId, Account_code: target.Account_code }, { $set: { Account_code: newCode } });
    return { changed: result.modifiedCount, message: `Account code updated for ${target.Account_name || target.Account_uuid}` };
  }

  if (category === 'staff_ledger_unresolved') {
    const userId = toObjectId(payload.recordId);
    const ledger = await ledgerByUuid(String(payload.ledgerUuid || '').trim());
    if (!userId || !ledger) throw Object.assign(new Error('Valid user and ledger are required'), { statusCode: 400 });
    const result = await c.users.updateOne(
      { _id: userId, $or: [{ Ledger_account_uuid: { $exists: false } }, { Ledger_account_uuid: '' }, { Ledger_account_uuid: null }] },
      { $set: { Ledger_account_uuid: ledger.uuid } }
    );
    return { changed: result.modifiedCount, message: `Staff ledger linked to ${ledger.name}` };
  }

  if (category === 'diary_assignment_unresolved' || category === 'bank_assignment_unresolved') {
    const ledger = await ledgerByUuid(String(payload.ledgerUuid || '').trim());
    const key = norm(payload.groupKey);
    if (!ledger || !key) throw Object.assign(new Error('Valid group and ledger are required'), { statusCode: 400 });
    const collectionName = category === 'diary_assignment_unresolved' ? 'diarydrafts' : 'bankstatements';
    const groups = await getUnresolvedAssignmentGroups(collectionName);
    const group = groups.find((row) => row.key === key);
    if (!group) throw Object.assign(new Error('Review group is no longer unresolved; refresh the list'), { statusCode: 409 });
    let changed = 0;
    for (const ref of group.refs) {
      const docId = toObjectId(ref.docId);
      if (!docId) continue;
      const base = `entries.${ref.index}`;
      const result = await c[collectionName].updateOne(
        { _id: docId, [`${base}.account_assigned`]: ref.legacy, $or: [{ [`${base}.account_assigned_uuid`]: { $exists: false } }, { [`${base}.account_assigned_uuid`]: '' }, { [`${base}.account_assigned_uuid`]: null }] },
        { $set: { [`${base}.account_assigned_uuid`]: ledger.uuid, [`${base}.account_assigned_name`]: ledger.name, [`${base}.account_assigned_type`]: ledger.type } }
      );
      changed += result.modifiedCount;
    }
    return { changed, message: `${changed} ${category.startsWith('diary') ? 'diary' : 'bank'} assignment(s) linked to ${ledger.name}` };
  }

  if (category === 'po_item_unresolved') {
    const itemUuid = String(payload.itemUuid || '').trim();
    const key = norm(payload.groupKey);
    if (!isUuid(itemUuid) || !key) throw Object.assign(new Error('Valid PO group and item are required'), { statusCode: 400 });
    const item = await c.items.findOne({ Item_uuid: itemUuid }, { projection: { Item_uuid: 1, Item_name: 1 } });
    if (!item) throw Object.assign(new Error('Catalog item not found'), { statusCode: 404 });
    const groups = await getPoGroups();
    const group = groups.find((row) => row.key === key);
    if (!group) throw Object.assign(new Error('PO group is no longer unresolved; refresh the list'), { statusCode: 409 });
    let changed = 0;
    for (const ref of group.refs) {
      const poId = toObjectId(ref.poId);
      if (!poId) continue;
      const base = `Items.${ref.index}`;
      const result = await c.purchaseorders.updateOne(
        { _id: poId, [`${base}.itemName`]: ref.itemName, $or: [{ [`${base}.itemUuid`]: { $exists: false } }, { [`${base}.itemUuid`]: '' }, { [`${base}.itemUuid`]: null }] },
        { $set: { [`${base}.itemUuid`]: item.Item_uuid } }
      );
      changed += result.modifiedCount;
    }
    return { changed, message: `${changed} PO line(s) linked to ${item.Item_name || item.Item_uuid}` };
  }

  if (category === 'transaction_integrity') {
    const txId = toObjectId(payload.recordId);
    const lineIndex = Number(payload.lineIndex);
    const expectedAccountId = String(payload.expectedAccountId || '').trim();
    const ledger = await ledgerByUuid(String(payload.ledgerUuid || '').trim());
    if (!txId || !Number.isInteger(lineIndex) || lineIndex < 0 || !ledger) throw Object.assign(new Error('Valid transaction line and replacement ledger are required'), { statusCode: 400 });
    const tx = await c.transactions.findOne({ _id: txId });
    if (!tx) throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
    const lines = Array.isArray(tx.Journal_entry) ? tx.Journal_entry : [];
    const line = lines[lineIndex];
    if (!line) throw Object.assign(new Error('Journal line not found'), { statusCode: 404 });
    if (String(line.Account_id || '').trim() !== expectedAccountId) throw Object.assign(new Error('Transaction changed since review; refresh before fixing'), { statusCode: 409 });
    const before = { Total_Debit: tx.Total_Debit, Total_Credit: tx.Total_Credit, Journal_entry: lines };
    const newLines = lines.map((entry, index) => index === lineIndex ? { ...entry, Account_id: ledger.uuid, Account_name: ledger.name } : entry);
    const result = await c.transactions.updateOne(
      { _id: txId, [`Journal_entry.${lineIndex}.Account_id`]: line.Account_id },
      { $set: { [`Journal_entry.${lineIndex}.Account_id`]: ledger.uuid, [`Journal_entry.${lineIndex}.Account_name`]: ledger.name } }
    );
    if (result.modifiedCount && tx.Transaction_uuid) {
      await TransactionAudit.create({
        Transaction_uuid: tx.Transaction_uuid,
        Transaction_id: tx.Transaction_id ?? null,
        action: 'edit',
        actor,
        actor_id: actorId,
        before,
        after: { Total_Debit: tx.Total_Debit, Total_Credit: tx.Total_Credit, Journal_entry: newLines },
      });
    }
    return { changed: result.modifiedCount, message: `Transaction line linked to ${ledger.name}` };
  }

  if (category === 'attendance_duplicate_day') {
    throw Object.assign(new Error('Attendance duplicate groups are inspect-only. No automatic merge/delete action is available.'), { statusCode: 400 });
  }

  throw Object.assign(new Error('Unsupported manual-review category'), { statusCode: 400 });
}

module.exports = {
  listManualReview,
  resolveManualReview,
  searchLedgerOptions,
  searchItemOptions,
};
