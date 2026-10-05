const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');

const Transaction = require('../repositories/transaction');
const transactionNumber = require('./transactionNumberService');
const { resolve: resolveAccount, isUuid } = require('./accountRegistry');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEGACY_SOURCES = [
  { key: 'old-transactions', label: 'Old Transactions', aliases: ['old transactions', 'oldtransactions', 'old_transactions', 'oldtransaction'], expectedStart: '2025-04-01', expectedEnd: '2025-10-20', financialYear: '2025-26' },
  { key: 'old-diwali-transactions', label: 'Old Diwali Transactions', aliases: ['olddiwalitransactions', 'old_diwali_transactions', 'old diwali transactions'], expectedStart: '2025-10-23', expectedEnd: '2025-12-31', financialYear: '2025-26' },
  { key: 'old-transactions-25-26', label: 'Old Transactions Jan-Mar 2026', aliases: ['oldtransactions25-26', 'oldtransactions2526', 'old_transactions25_26', 'oldtransactions25_26'], expectedStart: '2026-01-01', expectedEnd: '2026-03-31', financialYear: '2025-26' },
];

function canonicalCollectionName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function discoverLegacyCollections() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is not ready');
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
  const byCanonical = new Map(names.map((name) => [canonicalCollectionName(name), name]));
  return LEGACY_SOURCES.map((source) => {
    const found = source.aliases.map((alias) => byCanonical.get(canonicalCollectionName(alias))).find(Boolean) || null;
    return { ...source, collectionName: found };
  });
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row && row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function parseDate(row) {
  const raw = firstValue(row, ['Transaction_date', 'transaction_date', 'TransactionDate', 'transactionDate', 'Date', 'date', 'CreatedAt', 'createdAt']);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toAmount(value) {
  const n = Number(String(value == null ? '' : value).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['debit', 'dr', 'd'].includes(v)) return 'Debit';
  if (['credit', 'cr', 'c'].includes(v)) return 'Credit';
  return '';
}

function rawJournal(row) {
  const lines = firstValue(row, ['Journal_entry', 'JournalEntry', 'journal_entry', 'journalEntry']);
  return Array.isArray(lines) ? lines : [];
}

function inspectJournal(row) {
  const lines = rawJournal(row);
  if (lines.length < 2) return { valid: false, reason: 'Journal has fewer than 2 lines', lines: [] };

  let debit = 0;
  let credit = 0;
  let unresolvedAccountNames = 0;
  const normalized = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || {};
    const account = firstValue(line, ['Account_id', 'AccountId', 'account_id', 'accountId', 'Account_name', 'AccountName', 'account_name']);
    const type = normalizeType(firstValue(line, ['Type', 'type', 'DrCr', 'drCr']));
    const amount = toAmount(firstValue(line, ['Amount', 'amount', 'Value', 'value']));

    if (!account) return { valid: false, reason: 'Journal line ' + (index + 1) + ' has no account', lines: [] };
    if (!type) return { valid: false, reason: 'Journal line ' + (index + 1) + ' has invalid debit/credit type', lines: [] };
    if (!(amount > 0)) return { valid: false, reason: 'Journal line ' + (index + 1) + ' has invalid amount', lines: [] };

    if (!UUID_RE.test(String(account).trim())) unresolvedAccountNames += 1;
    if (type === 'Debit') debit += amount;
    else credit += amount;

    normalized.push({
      Account_id: String(account).trim(),
      Account_name: String(firstValue(line, ['Account_name', 'AccountName', 'account_name']) || '').trim(),
      Type: type,
      Amount: amount,
    });
  }

  debit = Number(debit.toFixed(2));
  credit = Number(credit.toFixed(2));
  if (debit !== credit) return { valid: false, reason: 'Journal is not balanced (' + debit + ' debit vs ' + credit + ' credit)', lines: normalized };
  return { valid: true, debit, credit, unresolvedAccountNames, lines: normalized };
}

function isoDay(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : null;
}

function inExpectedRange(date, source) {
  if (!date) return false;
  const day = isoDay(date);
  return day >= source.expectedStart && day <= source.expectedEnd;
}

function sourceEventKey(collectionName, legacyId) {
  return 'legacy:' + collectionName + ':' + String(legacyId);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

async function summarizeCollection(collectionName, source, options = {}) {
  const sampleLimit = options.sampleLimit || 50;
  const collection = mongoose.connection.db.collection(collectionName);
  const rows = await collection.find({}).toArray();

  let valid = 0;
  let blockers = 0;
  let warnings = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let minDate = null;
  let maxDate = null;
  const issues = [];

  for (const row of rows) {
    const date = parseDate(row);
    const journal = inspectJournal(row);
    const rowIssues = [];

    if (!date) rowIssues.push({ severity: 'blocker', message: 'Missing or invalid transaction date' });
    else if (!inExpectedRange(date, source)) rowIssues.push({ severity: 'blocker', message: 'Date ' + isoDay(date) + ' is outside expected ' + source.expectedStart + ' to ' + source.expectedEnd });

    if (!journal.valid) rowIssues.push({ severity: 'blocker', message: journal.reason });
    else if (journal.unresolvedAccountNames) rowIssues.push({ severity: 'warning', message: journal.unresolvedAccountNames + ' journal account name(s) will be resolved to UUID during migration' });

    if (rowIssues.some((issue) => issue.severity === 'blocker')) blockers += 1;
    else valid += 1;
    warnings += rowIssues.filter((issue) => issue.severity === 'warning').length;

    if (date) {
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }
    if (journal.valid) {
      totalDebit += journal.debit;
      totalCredit += journal.credit;
    }

    if (rowIssues.length && issues.length < sampleLimit) {
      issues.push({
        legacyId: String(row._id),
        transactionUuid: String(firstValue(row, ['Transaction_uuid', 'transaction_uuid']) || ''),
        transactionId: firstValue(row, ['Transaction_id', 'transaction_id']) || null,
        date: isoDay(date),
        issues: rowIssues,
      });
    }
  }

  const migrated = await Transaction.countDocuments({ Event_key: { $regex: '^legacy:' + escapeRegex(collectionName) + ':' } });

  return {
    key: source.key,
    label: source.label,
    collectionName,
    financialYear: source.financialYear,
    expectedStart: source.expectedStart,
    expectedEnd: source.expectedEnd,
    count: rows.length,
    valid,
    blockers,
    warnings,
    migrated,
    remaining: Math.max(rows.length - migrated, 0),
    minDate: isoDay(minDate),
    maxDate: isoDay(maxDate),
    totalDebit: Number(totalDebit.toFixed(2)),
    totalCredit: Number(totalCredit.toFixed(2)),
    issues,
  };
}

async function financialYearSummary() {
  const ranges = {
    '2025-26': [new Date('2025-04-01T00:00:00.000Z'), new Date('2026-04-01T00:00:00.000Z')],
    '2026-27': [new Date('2026-04-01T00:00:00.000Z'), new Date('2027-04-01T00:00:00.000Z')],
  };
  const output = {};

  for (const [label, range] of Object.entries(ranges)) {
    const rows = await Transaction.aggregate([
      { $match: { Transaction_date: { $gte: range[0], $lt: range[1] } } },
      { $group: { _id: null, count: { $sum: 1 }, totalDebit: { $sum: '$Total_Debit' }, totalCredit: { $sum: '$Total_Credit' }, minDate: { $min: '$Transaction_date' }, maxDate: { $max: '$Transaction_date' } } },
    ]);
    const row = rows[0] || {};
    output[label] = {
      count: row.count || 0,
      totalDebit: Number((row.totalDebit || 0).toFixed(2)),
      totalCredit: Number((row.totalCredit || 0).toFixed(2)),
      minDate: isoDay(row.minDate),
      maxDate: isoDay(row.maxDate),
    };
  }
  return output;
}

async function auditLegacyTransactions() {
  const discovered = await discoverLegacyCollections();
  const sources = [];

  for (const source of discovered) {
    if (!source.collectionName) {
      sources.push({
        ...source,
        count: 0, valid: 0, blockers: 1, warnings: 0, migrated: 0, remaining: 0,
        minDate: null, maxDate: null, totalDebit: 0, totalCredit: 0,
        issues: [{ legacyId: null, issues: [{ severity: 'blocker', message: 'Legacy collection not found in this database' }] }],
      });
    } else {
      sources.push(await summarizeCollection(source.collectionName, source));
    }
  }

  const blockers = sources.reduce((sum, source) => sum + source.blockers, 0);
  return {
    generatedAt: new Date().toISOString(),
    canMigrate: blockers === 0,
    blockers,
    sources,
    unifiedByFinancialYear: await financialYearSummary(),
  };
}

async function normalizeForMigration(row, collectionName) {
  const date = parseDate(row);
  const journal = inspectJournal(row);
  if (!date || !journal.valid) throw new Error(journal.reason || 'Invalid transaction date');

  const resolvedJournal = [];
  for (const line of journal.lines) {
    let accountUuid = line.Account_id;
    let accountName = line.Account_name;

    if (!isUuid(accountUuid)) {
      const resolved = await resolveAccount(accountUuid);
      accountUuid = resolved.uuid;
      accountName = accountName || resolved.name;
    } else if (!accountName) {
      try {
        const resolved = await resolveAccount(accountUuid);
        accountName = resolved.name || accountUuid;
      } catch {
        accountName = accountUuid;
      }
    }

    resolvedJournal.push({ Account_id: accountUuid, Account_name: accountName || accountUuid, Type: line.Type, Amount: line.Amount });
  }

  let transactionUuid = String(firstValue(row, ['Transaction_uuid', 'transaction_uuid']) || '').trim();
  if (!UUID_RE.test(transactionUuid) || await Transaction.exists({ Transaction_uuid: transactionUuid })) transactionUuid = uuid();

  const suppliedId = Number(firstValue(row, ['Transaction_id', 'transaction_id']));
  let transactionId = Number.isFinite(suppliedId) && suppliedId > 0 ? suppliedId : null;
  if (!transactionId || await Transaction.exists({ Transaction_id: transactionId })) transactionId = await transactionNumber.allocate();

  return {
    Transaction_uuid: transactionUuid,
    Transaction_id: transactionId,
    Order_uuid: firstValue(row, ['Order_uuid', 'order_uuid']) || null,
    Order_number: Number(firstValue(row, ['Order_number', 'Order_Number', 'order_number'])) || null,
    Transaction_date: date,
    Description: String(firstValue(row, ['Description', 'description', 'Narration', 'narration']) || 'Legacy transaction').trim(),
    Total_Debit: journal.debit,
    Total_Credit: journal.credit,
    Payment_mode: String(firstValue(row, ['Payment_mode', 'payment_mode', 'PaymentMode']) || 'Legacy').trim(),
    Created_by: String(firstValue(row, ['Created_by', 'created_by', 'CreatedBy']) || 'legacy-migration').trim(),
    image: firstValue(row, ['image', 'Image']) || undefined,
    Journal_entry: resolvedJournal,
    Customer_uuid: firstValue(row, ['Customer_uuid', 'customer_uuid']) || null,
    Upi_reference: String(firstValue(row, ['Upi_reference', 'upi_reference']) || ''),
    Upi_status: String(firstValue(row, ['Upi_status', 'upi_status']) || ''),
    Upi_app: String(firstValue(row, ['Upi_app', 'upi_app']) || ''),
    Upi_payee_vpa: String(firstValue(row, ['Upi_payee_vpa', 'upi_payee_vpa']) || ''),
    Upi_response_raw: firstValue(row, ['Upi_response_raw', 'upi_response_raw']) || null,
    Source: 'legacy-migration:' + collectionName,
    Event_key: sourceEventKey(collectionName, row._id),
    createdAt: firstValue(row, ['createdAt', 'CreatedAt']) || date,
    updatedAt: firstValue(row, ['updatedAt', 'UpdatedAt']) || date,
  };
}

async function migrateLegacyTransactions() {
  const audit = await auditLegacyTransactions();
  if (!audit.canMigrate) {
    const err = new Error('Migration blocked. Run audit and resolve every blocker first.');
    err.statusCode = 409;
    err.audit = audit;
    throw err;
  }

  const results = [];
  for (const source of audit.sources) {
    const collection = mongoose.connection.db.collection(source.collectionName);
    const cursor = collection.find({});
    let inserted = 0;
    let skipped = 0;
    const failures = [];

    while (await cursor.hasNext()) {
      const row = await cursor.next();
      const eventKey = sourceEventKey(source.collectionName, row._id);
      if (await Transaction.exists({ Event_key: eventKey })) {
        skipped += 1;
        continue;
      }
      try {
        const doc = await normalizeForMigration(row, source.collectionName);
        await Transaction.create(doc);
        inserted += 1;
      } catch (error) {
        failures.push({ legacyId: String(row._id), message: error.message });
        break;
      }
    }

    results.push({ key: source.key, collectionName: source.collectionName, inserted, skipped, failures });
    if (failures.length) {
      const err = new Error('Migration stopped because ' + source.collectionName + ' had a write failure');
      err.statusCode = 409;
      err.results = results;
      throw err;
    }
  }

  await transactionNumber.ensureSeeded();
  return { completedAt: new Date().toISOString(), results, verification: await auditLegacyTransactions() };
}

module.exports = { LEGACY_SOURCES, auditLegacyTransactions, migrateLegacyTransactions, financialYearSummary };
