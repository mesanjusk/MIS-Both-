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

function storedTotals(row) {
  return {
    debit: toAmount(firstValue(row, ['Total_Debit', 'total_debit', 'TotalDebit'])),
    credit: toAmount(firstValue(row, ['Total_Credit', 'total_credit', 'TotalCredit'])),
  };
}

function isZeroValuePlaceholder(row) {
  const totals = storedTotals(row);
  return rawJournal(row).length < 2 && totals.debit === 0 && totals.credit === 0;
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

const FY_2025_26_START = '2025-04-01';
const FY_2025_26_END = '2026-03-31';

function inFinancialYear2025_26(date) {
  if (!date) return false;
  const day = isoDay(date);
  return day >= FY_2025_26_START && day <= FY_2025_26_END;
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

function transactionFingerprint(row) {
  const date = parseDate(row);
  const journal = inspectJournal(row);
  if (!date || !journal.valid) return null;
  const description = String(firstValue(row, ['Description', 'description', 'Narration', 'narration']) || '').trim().toLowerCase();
  const paymentMode = String(firstValue(row, ['Payment_mode', 'payment_mode', 'PaymentMode']) || '').trim().toLowerCase();
  const journalSignature = journal.lines
    .map((line) => [String(line.Account_id || '').trim().toLowerCase(), line.Type, Number(line.Amount || 0).toFixed(2)].join('|'))
    .sort()
    .join('||');
  return [
    isoDay(date),
    description,
    paymentMode,
    Number(journal.debit || 0).toFixed(2),
    Number(journal.credit || 0).toFixed(2),
    journalSignature,
  ].join('::');
}

async function buildLegacyDuplicateIndex(discovered) {
  const byUuid = new Map();
  const byFingerprint = new Map();

  function add(map, key, ref) {
    if (!key) return;
    const list = map.get(key) || [];
    list.push(ref);
    map.set(key, list);
  }

  for (const source of discovered) {
    if (!source.collectionName) continue;
    const rows = await mongoose.connection.db.collection(source.collectionName).find({}).toArray();
    for (const row of rows) {
      const date = parseDate(row);
      if (!date || !inFinancialYear2025_26(date)) continue;
      const ref = {
        sourceKey: source.key,
        collectionName: source.collectionName,
        legacyId: String(row._id),
        date: isoDay(date),
      };
      const transactionUuid = String(firstValue(row, ['Transaction_uuid', 'transaction_uuid']) || '').trim();
      if (UUID_RE.test(transactionUuid)) add(byUuid, transactionUuid.toLowerCase(), ref);
      add(byFingerprint, transactionFingerprint(row), ref);
    }
  }

  return { byUuid, byFingerprint };
}

function duplicateMatches(row, duplicateIndex) {
  const matches = [];
  const seen = new Set();
  const transactionUuid = String(firstValue(row, ['Transaction_uuid', 'transaction_uuid']) || '').trim();
  const fingerprint = transactionFingerprint(row);
  const candidates = [];

  if (UUID_RE.test(transactionUuid)) candidates.push(...(duplicateIndex.byUuid.get(transactionUuid.toLowerCase()) || []));
  if (fingerprint) candidates.push(...(duplicateIndex.byFingerprint.get(fingerprint) || []));

  for (const match of candidates) {
    const key = match.collectionName + ':' + match.legacyId;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push(match);
    }
  }
  return matches;
}

function isSameLegacyRow(match, collectionName, row) {
  return match.collectionName === collectionName && match.legacyId === String(row._id);
}

function safeLegacyDetail(row, source) {
  return {
    sourceKey: source.key,
    sourceLabel: source.label,
    collectionName: source.collectionName,
    legacyId: String(row._id),
    transactionUuid: String(firstValue(row, ['Transaction_uuid', 'transaction_uuid']) || ''),
    transactionId: firstValue(row, ['Transaction_id', 'transaction_id']) || null,
    transactionDate: isoDay(parseDate(row)),
    description: String(firstValue(row, ['Description', 'description', 'Narration', 'narration']) || ''),
    paymentMode: String(firstValue(row, ['Payment_mode', 'payment_mode', 'PaymentMode']) || ''),
    createdBy: String(firstValue(row, ['Created_by', 'created_by', 'CreatedBy']) || ''),
    orderUuid: firstValue(row, ['Order_uuid', 'order_uuid']) || null,
    orderNumber: firstValue(row, ['Order_number', 'Order_Number', 'order_number']) || null,
    customerUuid: firstValue(row, ['Customer_uuid', 'customer_uuid']) || null,
    totalDebit: firstValue(row, ['Total_Debit', 'total_debit', 'TotalDebit']) ?? null,
    totalCredit: firstValue(row, ['Total_Credit', 'total_credit', 'TotalCredit']) ?? null,
    journalEntry: rawJournal(row),
    availableFields: Object.keys(row).filter((key) => !['_id', '__v'].includes(key)).sort(),
  };
}

async function getLegacyTransactionDetail(sourceKey, legacyId) {
  const discovered = await discoverLegacyCollections();
  const source = discovered.find((item) => item.key === sourceKey);
  if (!source || !source.collectionName) {
    const err = new Error('Legacy source not found');
    err.statusCode = 404;
    throw err;
  }

  let lookupId = legacyId;
  if (mongoose.Types.ObjectId.isValid(legacyId)) lookupId = new mongoose.Types.ObjectId(legacyId);
  const row = await mongoose.connection.db.collection(source.collectionName).findOne({ _id: lookupId });
  if (!row) {
    const err = new Error('Legacy transaction not found');
    err.statusCode = 404;
    throw err;
  }

  return safeLegacyDetail(row, source);
}

async function summarizeCollection(collectionName, source, duplicateIndex, options = {}) {
  const sampleLimit = options.sampleLimit || 50;
  const collection = mongoose.connection.db.collection(collectionName);
  const rows = await collection.find({}).toArray();

  let eligible = 0;
  let valid = 0;
  let ignoredOutsideFinancialYear = 0;
  let ignoredZeroValuePlaceholders = 0;
  let blockers = 0;
  let warnings = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let minDate = null;
  let maxDate = null;
  const issues = [];

  for (const row of rows) {
    const date = parseDate(row);
    const rowIssues = [];

    if (!date) {
      blockers += 1;
      rowIssues.push({ severity: 'blocker', message: 'Missing or invalid transaction date' });
    } else if (!inFinancialYear2025_26(date)) {
      ignoredOutsideFinancialYear += 1;
      warnings += 1;
      rowIssues.push({
        severity: 'warning',
        message: 'Ignored: date ' + isoDay(date) + ' is outside FY 2025-26 (' + FY_2025_26_START + ' to ' + FY_2025_26_END + ')',
      });
    } else {
      eligible += 1;

      const journal = inspectJournal(row);
      const spillover = !inExpectedRange(date, source);

      if (isZeroValuePlaceholder(row)) {
        ignoredZeroValuePlaceholders += 1;
        warnings += 1;
        rowIssues.push({
          severity: 'warning',
          message: 'Ignored zero-value placeholder: stored Debit/Credit are 0 and journal has fewer than 2 lines.',
        });
      } else if (spillover) {
        const duplicates = duplicateMatches(row, duplicateIndex).filter((match) => !isSameLegacyRow(match, collectionName, row));
        if (duplicates.length) {
          blockers += 1;
          rowIssues.push({
            severity: 'blocker',
            message: 'Spillover row matches another legacy row (' + duplicates.map((match) => match.collectionName + '/' + match.legacyId).join(', ') + '). Review duplicate before migration.',
          });
        } else if (!journal.valid) {
          blockers += 1;
          rowIssues.push({ severity: 'blocker', message: journal.reason });
        } else {
          valid += 1;
          totalDebit += journal.debit;
          totalCredit += journal.credit;
          warnings += 1;
          rowIssues.push({
            severity: 'warning',
            message: 'Unique FY 2025-26 spillover row; it will migrate despite being outside this source\'s expected period.',
          });
          if (journal.unresolvedAccountNames) {
            warnings += 1;
            rowIssues.push({
              severity: 'warning',
              message: journal.unresolvedAccountNames + ' journal account name(s) will be resolved to UUID during migration',
            });
          }
        }
      } else if (!journal.valid) {
        blockers += 1;
        rowIssues.push({ severity: 'blocker', message: journal.reason });
      } else {
        valid += 1;
        totalDebit += journal.debit;
        totalCredit += journal.credit;

        if (journal.unresolvedAccountNames) {
          warnings += 1;
          rowIssues.push({
            severity: 'warning',
            message: journal.unresolvedAccountNames + ' journal account name(s) will be resolved to UUID during migration',
          });
        }
      }

      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
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
    eligible,
    valid,
    ignoredOutsideFinancialYear,
    ignoredZeroValuePlaceholders,
    blockers,
    warnings,
    migrated,
    remaining: Math.max(eligible - ignoredZeroValuePlaceholders - migrated, 0),
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
  const duplicateIndex = await buildLegacyDuplicateIndex(discovered);
  const sources = [];

  for (const source of discovered) {
    if (!source.collectionName) {
      sources.push({
        ...source,
        count: 0, eligible: 0, valid: 0, ignoredOutsideFinancialYear: 0, ignoredZeroValuePlaceholders: 0, blockers: 1, warnings: 0, migrated: 0, remaining: 0,
        minDate: null, maxDate: null, totalDebit: 0, totalCredit: 0,
        issues: [{ legacyId: null, issues: [{ severity: 'blocker', message: 'Legacy collection not found in this database' }] }],
      });
    } else {
      sources.push(await summarizeCollection(source.collectionName, source, duplicateIndex));
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

  const discovered = await discoverLegacyCollections();
  const duplicateIndex = await buildLegacyDuplicateIndex(discovered);
  const results = [];
  const batchSize = 200;

  for (const source of audit.sources) {
    const collection = mongoose.connection.db.collection(source.collectionName);
    let inserted = 0;
    let skipped = 0;
    let ignoredOutsideFinancialYear = 0;
    let ignoredZeroValuePlaceholders = 0;
    const failures = [];
    let lastId = null;

    while (true) {
      const query = lastId ? { _id: { $gt: lastId } } : {};
      const batch = await collection.find(query).sort({ _id: 1 }).limit(batchSize).toArray();
      if (!batch.length) break;

      for (const row of batch) {
        lastId = row._id;
        const date = parseDate(row);

        if (!date) {
          failures.push({ legacyId: String(row._id), message: 'Missing or invalid transaction date' });
          break;
        }

        if (!inFinancialYear2025_26(date)) {
          ignoredOutsideFinancialYear += 1;
          continue;
        }

        if (isZeroValuePlaceholder(row)) {
          ignoredZeroValuePlaceholders += 1;
          continue;
        }

        if (!inExpectedRange(date, source)) {
          const duplicates = duplicateMatches(row, duplicateIndex).filter((match) => !isSameLegacyRow(match, source.collectionName, row));
          if (duplicates.length) {
            failures.push({
              legacyId: String(row._id),
              message: 'Spillover row duplicates another legacy source and cannot be migrated automatically.',
            });
            break;
          }
        }

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

      if (failures.length || batch.length < batchSize) break;
    }

    results.push({
      key: source.key,
      collectionName: source.collectionName,
      inserted,
      skipped,
      ignoredOutsideFinancialYear,
      ignoredZeroValuePlaceholders,
      failures,
    });

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

module.exports = { LEGACY_SOURCES, auditLegacyTransactions, migrateLegacyTransactions, financialYearSummary, getLegacyTransactionDetail };
