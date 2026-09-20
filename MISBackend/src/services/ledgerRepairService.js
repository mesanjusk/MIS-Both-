'use strict';

const Transaction = require('../repositories/transaction');
const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');
const VendorLedger = require('../repositories/vendorLedger');
const VendorMaster = require('../repositories/vendorMaster');
const DiaryDraft = require('../repositories/diaryDraft');
const BankStatement = require('../repositories/bankStatement');
const PurchaseOrder = require('../repositories/purchaseOrder');
const Orders = require('../repositories/order');
const {
  auditLedgerIntegrity,
  journalProblem,
  orderTotal,
} = require('./ledgerIntegrityService');
const {
  SYSTEM_ACCOUNTS,
  BUSINESS_SOURCES,
  upsertBalancedTransaction,
  postVendorLedgerEntry,
} = require('./accountingPostingService');

const round2 = (value) => Number(Number(value || 0).toFixed(2));
const PAYMENT_MODE_MAP = { cash: 'Cash', cheque: 'Cheque', upi: 'UPI', neft: 'Bank', bank: 'Bank' };

function dayBounds(value) {
  const d = value ? new Date(value) : new Date();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function inferPaymentMode(row = {}) {
  const text = String(row.narration || '').toLowerCase();
  if (/upi|phonepe|gpay|google pay|paytm/.test(text)) return 'UPI';
  if (/bank|neft|rtgs|imps|cheque|check/.test(text)) return 'Bank';
  return 'Cash';
}

function vendorCandidateSources(row = {}) {
  const refType = String(row.reference_type || '').trim();
  const refId = String(row.reference_id || '').trim();
  const orderUuid = String(row.order_uuid || '').trim();
  const jobUuid = String(row.job_uuid || '').trim();
  const out = [];

  if (refType === 'purchase_order' && refId) {
    out.push(`${BUSINESS_SOURCES.PURCHASE}:${refId}`);
  }
  if (refType === 'order_step_bill' && refId && orderUuid) {
    out.push(`${BUSINESS_SOURCES.VENDOR_BILL}:order_step:${orderUuid}:${refId}`);
  }
  if (refId && /_bill$/i.test(refType)) {
    out.push(`${BUSINESS_SOURCES.VENDOR_BILL}:${refId}`);
  }
  if (refId && /_advance$/i.test(refType)) {
    out.push(`${BUSINESS_SOURCES.VENDOR_ADVANCE}:${refId}`);
  }
  if (jobUuid) {
    if (String(row.entry_type || '').toLowerCase() === 'advance_paid') {
      out.push(`${BUSINESS_SOURCES.VENDOR_ADVANCE}:${jobUuid}`);
    } else {
      out.push(`${BUSINESS_SOURCES.VENDOR_BILL}:${jobUuid}`);
    }
  }
  if (String(row.entry_type || '').toLowerCase() === 'opening') {
    const vendorUuid = String(row.vendor_uuid || '').trim();
    if (vendorUuid) {
      out.push(`${BUSINESS_SOURCES.VENDOR_OPENING}:vendor:${vendorUuid}`);
      out.push(`${BUSINESS_SOURCES.VENDOR_OPENING}:${vendorUuid}`);
    }
  }

  return [...new Set(out.filter(Boolean))];
}

function buildTransactionLookup(transactions = []) {
  const byUuid = new Map();
  const bySource = new Map();
  for (const txn of transactions) {
    const uuid = String(txn.Transaction_uuid || '').trim();
    const source = String(txn.Source || '').trim();
    if (uuid) byUuid.set(uuid, txn);
    if (source && !bySource.has(source)) bySource.set(source, txn);
  }
  return { byUuid, bySource };
}

function addTransactionToLookup(lookup, txn) {
  if (!lookup || !txn) return;
  const uuid = String(txn.Transaction_uuid || '').trim();
  const source = String(txn.Source || '').trim();
  if (uuid) lookup.byUuid.set(uuid, txn);
  if (source) lookup.bySource.set(source, txn);
}

function findExistingVendorTransaction(row, lookup) {
  const transactionUuid = String(row.transaction_uuid || '').trim();
  if (transactionUuid && lookup?.byUuid.has(transactionUuid)) {
    return lookup.byUuid.get(transactionUuid);
  }

  const refId = String(row.reference_id || '').trim();
  if (refId && lookup?.byUuid.has(refId)) {
    return lookup.byUuid.get(refId);
  }

  for (const source of vendorCandidateSources(row)) {
    if (lookup?.bySource.has(source)) return lookup.bySource.get(source);
  }

  return null;
}

function receiptAmountForOrder(order, transactions) {
  const relevant = transactions.filter((txn) =>
    (order.Order_uuid && String(txn.Order_uuid || '') === String(order.Order_uuid)) ||
    (order.Order_Number && Number(txn.Order_number) === Number(order.Order_Number))
  );
  return round2(
    relevant
      .filter((txn) => {
        const source = String(txn.Source || '');
        return (
          source.startsWith(BUSINESS_SOURCES.CUSTOMER_RECEIPT) ||
          source.startsWith(BUSINESS_SOURCES.CUSTOMER_ADVANCE)
        );
      })
      .reduce((sum, txn) => sum + Number(txn.Total_Debit || txn.Total_Credit || 0), 0)
  );
}

async function repairPurchaseOrders({ apply, result, transactionLookup, plannedSources }) {
  const pos = await PurchaseOrder.find({ status: { $ne: 'cancelled' } }).lean();
  const { syncPurchasePosting } = require('../routes/PurchaseOrder');

  for (const po of pos) {
    const extra = (po.extraCharges || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const total = round2(Number(po.totalAmount || 0) + extra);
    if (!(total > 0)) continue;

    const source = `${BUSINESS_SOURCES.PURCHASE}:${po.PO_uuid}`;
    if (transactionLookup.bySource.has(source)) continue;
    plannedSources.add(source);

    result.actions.purchaseOrders.push({
      poUuid: po.PO_uuid,
      poNumber: po.PO_Number,
      total,
      action: 'create_purchase_posting',
    });

    if (!apply) continue;
    try {
      const posting = await syncPurchasePosting(po, {
        txnDate: po.poDate || po.createdAt || null,
        createdBy: 'ledger-history-repair',
      });
      addTransactionToLookup(transactionLookup, posting?.transaction || posting);
      result.applied.purchaseOrders += 1;
    } catch (error) {
      result.failures.push({ area: 'purchaseOrder', id: po.PO_uuid, error: error.message });
    }
  }
}

async function repairVendorLedger({ apply, result, transactionLookup, plannedSources }) {
  const rows = await VendorLedger.find({ amount: { $gt: 0 } }).sort({ date: 1, createdAt: 1 });
  for (const row of rows) {
    const existing = findExistingVendorTransaction(row, transactionLookup);
    if (existing) {
      if (String(row.transaction_uuid || '') !== String(existing.Transaction_uuid || '')) {
        result.actions.vendorLedger.push({
          entryUuid: row.entry_uuid,
          entryType: row.entry_type,
          amount: row.amount,
          action: 'link_existing',
          transactionUuid: existing.Transaction_uuid,
        });
        if (apply) {
          row.transaction_uuid = existing.Transaction_uuid;
          await row.save();
          result.applied.vendorLinks += 1;
        }
      }
      continue;
    }

    const plannedSource = vendorCandidateSources(row).find((source) => plannedSources.has(source));
    if (plannedSource) {
      result.actions.vendorLedger.push({
        entryUuid: row.entry_uuid,
        entryType: row.entry_type,
        amount: row.amount,
        action: 'link_after_source_repair',
        source: plannedSource,
      });
      continue;
    }

    result.actions.vendorLedger.push({
      entryUuid: row.entry_uuid,
      vendorUuid: row.vendor_uuid,
      entryType: row.entry_type,
      amount: row.amount,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      action: 'create_missing_posting',
    });

    if (!apply) continue;
    try {
      const posting = await postVendorLedgerEntry({
        amount: row.amount,
        entryType: row.entry_type,
        drCr: row.dr_cr,
        paymentMode: inferPaymentMode(row),
        description: row.narration || `Legacy vendor ledger ${row.entry_type}`,
        narration: row.narration,
        orderUuid: row.order_uuid || null,
        orderNumber: row.order_number || null,
        createdBy: 'ledger-history-repair',
        transactionDate: row.date || row.createdAt || new Date(),
        sourceSuffix: `legacy:${row.entry_uuid}`,
        reference: row.reference_id || '',
      });
      const uuid = posting?.transaction?.Transaction_uuid || '';
      if (!uuid) throw new Error('Posting did not return Transaction_uuid');
      row.transaction_uuid = uuid;
      await row.save();
      addTransactionToLookup(transactionLookup, posting.transaction);
      result.applied.vendorCreated += 1;
    } catch (error) {
      result.failures.push({ area: 'vendorLedger', id: row.entry_uuid, error: error.message });
    }
  }
}

async function legacyDiaryCandidate(diary, entry) {
  const { start, end } = dayBounds(diary.diary_date || diary.createdAt);
  const amount = round2(entry.amount);
  const description = [entry.party, entry.notes].filter(Boolean).join(' - ');
  const candidates = await Transaction.find({
    Source: 'diary',
    Transaction_date: { $gte: start, $lt: end },
    Total_Debit: amount,
    Total_Credit: amount,
  }).lean();

  const exact = candidates.filter((txn) => {
    if (description && String(txn.Description || '') !== description) return false;
    if (!entry.account_assigned) return true;
    const target = String(entry.account_assigned).trim().toLowerCase();
    return (txn.Journal_entry || []).some((line) =>
      String(line.Account_id || '').trim().toLowerCase() === target ||
      String(line.Account_name || '').trim().toLowerCase() === target
    );
  });
  return exact.length === 1 ? exact[0] : null;
}

async function repairDiaries({ apply, result }) {
  const diaries = await DiaryDraft.find({ status: 'confirmed' });
  for (const diary of diaries) {
    let changed = false;
    for (const entry of diary.entries || []) {
      if (entry.entry_status !== 'confirmed') continue;
      const linked = entry.transaction_uuid
        ? await Transaction.findOne({ Transaction_uuid: entry.transaction_uuid }).lean()
        : null;
      if (linked) continue;

      const source = `diary:${diary.diary_uuid}:${entry.entry_uuid}`;
      let txn = await Transaction.findOne({ Source: source }).lean();
      if (!txn) txn = await legacyDiaryCandidate(diary, entry);

      if (txn) {
        result.actions.diaries.push({
          diaryUuid: diary.diary_uuid,
          entryUuid: entry.entry_uuid,
          action: 'link_existing',
          transactionUuid: txn.Transaction_uuid,
        });
        if (apply) {
          entry.transaction_uuid = txn.Transaction_uuid;
          changed = true;
          result.applied.diaryLinks += 1;
        }
        continue;
      }

      if (!entry.account_assigned || !(Number(entry.amount) > 0)) {
        result.unresolved.push({
          area: 'diary',
          id: `${diary.diary_uuid}:${entry.entry_uuid}`,
          reason: 'confirmed entry lacks account assignment or positive amount',
          entry: entry.toObject ? entry.toObject() : entry,
        });
        continue;
      }

      result.actions.diaries.push({
        diaryUuid: diary.diary_uuid,
        entryUuid: entry.entry_uuid,
        amount: entry.amount,
        action: 'create_missing_posting',
      });
      if (!apply) continue;

      try {
        const paymentMode = PAYMENT_MODE_MAP[String(entry.mode || '').toLowerCase()] || 'Cash';
        const description = [entry.party, entry.notes].filter(Boolean).join(' - ') || 'Diary entry';
        const bankOrCash = entry.book === 'bank' ? SYSTEM_ACCOUNTS.BANK : SYSTEM_ACCOUNTS.CASH;
        const posting = entry.direction === 'in'
          ? await upsertBalancedTransaction({
              amount: entry.amount,
              debitAccount: bankOrCash,
              creditAccount: entry.account_assigned,
              paymentMode,
              description,
              transactionDate: diary.diary_date || new Date(),
              createdBy: 'ledger-history-repair',
              source,
            })
          : await upsertBalancedTransaction({
              amount: entry.amount,
              debitAccount: entry.account_assigned,
              creditAccount: bankOrCash,
              paymentMode,
              description,
              transactionDate: diary.diary_date || new Date(),
              createdBy: 'ledger-history-repair',
              source,
            });
        entry.transaction_uuid = posting.transaction.Transaction_uuid;
        changed = true;
        result.applied.diaryCreated += 1;
      } catch (error) {
        result.failures.push({ area: 'diary', id: entry.entry_uuid, error: error.message });
      }
    }

    if (apply && changed) {
      diary.markModified('entries');
      await diary.save();
    }
  }
}

async function legacyBankCandidate(statement, entry) {
  const { start, end } = dayBounds(entry.txn_date || statement.createdAt);
  const amount = round2(Number(entry.credit || entry.debit || 0));
  const candidates = await Transaction.find({
    Source: BUSINESS_SOURCES.BANK_STATEMENT,
    Transaction_date: { $gte: start, $lt: end },
    Total_Debit: amount,
    Total_Credit: amount,
  }).lean();
  const description = String(entry.description || '').trim();
  const exact = candidates.filter((txn) =>
    !description || String(txn.Description || '').trim() === description
  );
  return exact.length === 1 ? exact[0] : null;
}

async function repairBankStatements({ apply, result }) {
  const statements = await BankStatement.find({ 'entries.entry_status': 'confirmed' });
  for (const statement of statements) {
    let changed = false;
    for (const entry of statement.entries || []) {
      if (entry.entry_status !== 'confirmed') continue;

      const linked = entry.transaction_uuid
        ? await Transaction.findOne({ Transaction_uuid: entry.transaction_uuid }).lean()
        : null;
      if (linked) continue;

      let txn = null;
      if (entry.matched_diary_uuid && entry.matched_diary_entry_uuid) {
        const diary = await DiaryDraft.findOne({ diary_uuid: entry.matched_diary_uuid }).lean();
        const diaryEntry = (diary?.entries || []).find(
          (e) => String(e.entry_uuid) === String(entry.matched_diary_entry_uuid)
        );
        if (diaryEntry?.transaction_uuid) {
          txn = await Transaction.findOne({ Transaction_uuid: diaryEntry.transaction_uuid }).lean();
        }
      }

      const source = `${BUSINESS_SOURCES.BANK_STATEMENT}:${statement.statement_uuid}:${entry.entry_uuid}`;
      if (!txn) txn = await Transaction.findOne({ Source: source }).lean();
      if (!txn) txn = await legacyBankCandidate(statement, entry);

      if (txn) {
        result.actions.bankStatements.push({
          statementUuid: statement.statement_uuid,
          entryUuid: entry.entry_uuid,
          action: 'link_existing',
          transactionUuid: txn.Transaction_uuid,
        });
        if (apply) {
          entry.transaction_uuid = txn.Transaction_uuid;
          changed = true;
          result.applied.bankLinks += 1;
        }
        continue;
      }

      const amount = round2(Number(entry.credit || entry.debit || 0));
      if (!entry.account_assigned || !(amount > 0)) {
        result.unresolved.push({
          area: 'bankStatement',
          id: `${statement.statement_uuid}:${entry.entry_uuid}`,
          reason: 'confirmed row lacks account assignment or positive amount',
          entry: entry.toObject ? entry.toObject() : entry,
        });
        continue;
      }

      result.actions.bankStatements.push({
        statementUuid: statement.statement_uuid,
        entryUuid: entry.entry_uuid,
        amount,
        action: 'create_missing_posting',
      });
      if (!apply) continue;

      try {
        const posting = entry.direction === 'in'
          ? await upsertBalancedTransaction({
              amount,
              debitAccount: SYSTEM_ACCOUNTS.BANK,
              creditAccount: entry.account_assigned,
              paymentMode: 'Bank',
              description: entry.description || entry.account_assigned,
              transactionDate: entry.txn_date || new Date(),
              createdBy: 'ledger-history-repair',
              source,
              reference: entry.ref_no || '',
            })
          : await upsertBalancedTransaction({
              amount,
              debitAccount: entry.account_assigned,
              creditAccount: SYSTEM_ACCOUNTS.BANK,
              paymentMode: 'Bank',
              description: entry.description || entry.account_assigned,
              transactionDate: entry.txn_date || new Date(),
              createdBy: 'ledger-history-repair',
              source,
              reference: entry.ref_no || '',
            });
        entry.transaction_uuid = posting.transaction.Transaction_uuid;
        changed = true;
        result.applied.bankCreated += 1;
      } catch (error) {
        result.failures.push({ area: 'bankStatement', id: entry.entry_uuid, error: error.message });
      }
    }

    if (apply && changed) {
      statement.markModified('entries');
      await statement.save();
    }
  }
}

async function repairPaidOrderFlags({ apply, result }) {
  const [paidOrders, transactions] = await Promise.all([
    Orders.find({ billStatus: 'paid' }).lean(),
    Transaction.find({}).lean(),
  ]);

  for (const order of paidOrders) {
    const total = orderTotal(order);
    if (!(total > 0)) continue;
    const received = receiptAmountForOrder(order, transactions);
    if (received + 0.009 >= total) continue;

    result.actions.paidOrders.push({
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      total,
      received,
      action: 'mark_unpaid',
    });

    if (apply) {
      await Orders.updateOne(
        { _id: order._id },
        {
          $set: {
            billStatus: 'unpaid',
            billPaidAt: null,
            billPaidBy: null,
            billPaidNote: null,
            billPaidTxnUuid: null,
            billPaidTxnId: null,
          },
        },
        { runValidators: false }
      );
      result.applied.paidOrders += 1;
    }
  }
}

async function diagnoseAndRepairTransactions({ apply, result }) {
  const [transactions, accounts, customers] = await Promise.all([
    Transaction.find({}),
    Accounts.find({}).lean(),
    Customer.find({}, { Customer_uuid: 1 }).lean(),
  ]);

  const valid = new Set([
    ...accounts.map((a) => String(a.Account_uuid || '')).filter(Boolean),
    ...customers.map((c) => String(c.Customer_uuid || '')).filter(Boolean),
  ]);

  for (const txn of transactions) {
    const problem = journalProblem(txn);
    if (problem) {
      const lines = Array.isArray(txn.Journal_entry) ? txn.Journal_entry : [];
      let debit = 0;
      let credit = 0;
      let journalOtherwiseValid = lines.length >= 2;
      for (const line of lines) {
        const amount = Number(line?.Amount);
        if (!line?.Account_id || !Number.isFinite(amount) || amount <= 0) {
          journalOtherwiseValid = false;
          break;
        }
        if (line.Type === 'Debit') debit += amount;
        else if (line.Type === 'Credit') credit += amount;
        else {
          journalOtherwiseValid = false;
          break;
        }
      }

      if (journalOtherwiseValid && round2(debit) === round2(credit)) {
        result.actions.transactions.push({
          transactionUuid: txn.Transaction_uuid,
          transactionId: txn.Transaction_id,
          action: 'repair_totals',
          debit: round2(debit),
          credit: round2(credit),
        });
        if (apply) {
          txn.Total_Debit = round2(debit);
          txn.Total_Credit = round2(credit);
          await txn.save();
          result.applied.transactionTotals += 1;
        }
      } else {
        result.unresolved.push({
          area: 'invalidTransaction',
          id: txn.Transaction_uuid,
          reason: problem,
          transaction: {
            Transaction_uuid: txn.Transaction_uuid,
            Transaction_id: txn.Transaction_id,
            Transaction_date: txn.Transaction_date,
            Description: txn.Description,
            Total_Debit: txn.Total_Debit,
            Total_Credit: txn.Total_Credit,
            Payment_mode: txn.Payment_mode,
            Customer_uuid: txn.Customer_uuid,
            Order_uuid: txn.Order_uuid,
            Order_number: txn.Order_number,
            Source: txn.Source,
            Journal_entry: txn.Journal_entry,
          },
        });
      }
    }

    let changed = false;
    const newLines = [];
    for (const line of txn.Journal_entry || []) {
      const id = String(line.Account_id || '');
      if (!id || valid.has(id)) {
        newLines.push(line.toObject ? line.toObject() : line);
        continue;
      }

      const lineName = String(line.Account_name || '').trim();
      let targetName = lineName && lineName !== id ? lineName : '';
      if (!targetName) {
        const vendor = await VendorMaster.findOne({ Vendor_uuid: id }, { Vendor_name: 1 }).lean();
        targetName = String(vendor?.Vendor_name || '').trim();
      }

      if (!targetName) {
        result.unresolved.push({
          area: 'unknownJournalAccount',
          id: `${txn.Transaction_uuid}:${id}`,
          reason: 'no account/customer/vendor name available for legacy Account_id',
          transaction: {
            Transaction_uuid: txn.Transaction_uuid,
            Transaction_id: txn.Transaction_id,
            Transaction_date: txn.Transaction_date,
            Description: txn.Description,
            Payment_mode: txn.Payment_mode,
            Customer_uuid: txn.Customer_uuid,
            Order_uuid: txn.Order_uuid,
            Order_number: txn.Order_number,
            Source: txn.Source,
            Journal_entry: txn.Journal_entry,
          },
        });
        newLines.push(line.toObject ? line.toObject() : line);
        continue;
      }

      result.actions.transactions.push({
        transactionUuid: txn.Transaction_uuid,
        action: 'resolve_unknown_account',
        oldAccountId: id,
        accountName: targetName,
      });

      if (apply) {
        const resolved = await require('./accountRegistry').resolve(targetName);
        newLines.push({
          Account_id: resolved.uuid,
          Account_name: resolved.name,
          Type: line.Type,
          Amount: line.Amount,
        });
        valid.add(resolved.uuid);
        changed = true;
        result.applied.unknownAccounts += 1;
      } else {
        newLines.push(line.toObject ? line.toObject() : line);
      }
    }

    if (apply && changed) {
      txn.Journal_entry = newLines;
      await txn.save();
    }
  }
}

async function reconcileAccountBalances({ apply, result }) {
  const [accounts, transactions] = await Promise.all([
    Accounts.find({}).lean(),
    Transaction.find({}).lean(),
  ]);
  const accountMap = new Map(accounts.map((a) => [String(a.Account_uuid), a]));
  const movements = new Map();

  for (const txn of transactions) {
    for (const line of txn.Journal_entry || []) {
      const account = accountMap.get(String(line.Account_id || ''));
      if (!account) continue;
      const amount = Number(line.Amount);
      if (!Number.isFinite(amount)) continue;
      const normal = String(account.Normal_balance_side || 'debit').toLowerCase();
      const onNormal =
        (line.Type === 'Debit' && normal === 'debit') ||
        (line.Type === 'Credit' && normal === 'credit');
      movements.set(account.Account_uuid, (movements.get(account.Account_uuid) || 0) + (onNormal ? amount : -amount));
    }
  }

  for (const account of accounts) {
    const expected = round2(movements.get(account.Account_uuid) || 0);
    const stored = round2(account.Balance || 0);
    if (expected === stored) continue;
    result.actions.accountBalances.push({
      accountUuid: account.Account_uuid,
      accountName: account.Account_name,
      stored,
      expected,
      action: 'set_from_journal',
    });
    if (apply) {
      await Accounts.updateOne(
        { Account_uuid: account.Account_uuid },
        { $set: { Balance: expected, Updated_at: new Date() } }
      );
      result.applied.accountBalances += 1;
    }
  }
}

function trimResult(result, limit = 30) {
  const trimmed = {
    mode: result.mode,
    preAudit: result.preAudit,
    actionCounts: Object.fromEntries(
      Object.entries(result.actions).map(([key, rows]) => [key, rows.length])
    ),
    actionSamples: Object.fromEntries(
      Object.entries(result.actions).map(([key, rows]) => [key, rows.slice(0, limit)])
    ),
    applied: result.applied,
    failures: result.failures.slice(0, limit),
    unresolved: result.unresolved.slice(0, limit),
  };
  if (result.postAudit) trimmed.postAudit = result.postAudit;
  return trimmed;
}

async function repairLedgerIntegrity({ apply = false } = {}) {
  const result = {
    mode: apply ? 'repair' : 'plan',
    preAudit: await auditLedgerIntegrity({ sampleLimit: 10 }),
    actions: {
      purchaseOrders: [],
      vendorLedger: [],
      diaries: [],
      bankStatements: [],
      paidOrders: [],
      transactions: [],
      accountBalances: [],
    },
    applied: {
      purchaseOrders: 0,
      vendorLinks: 0,
      vendorCreated: 0,
      diaryLinks: 0,
      diaryCreated: 0,
      bankLinks: 0,
      bankCreated: 0,
      paidOrders: 0,
      transactionTotals: 0,
      unknownAccounts: 0,
      accountBalances: 0,
    },
    failures: [],
    unresolved: [],
    postAudit: null,
  };

  const transactionLookup = buildTransactionLookup(
    await Transaction.find({}, { Transaction_uuid: 1, Source: 1 }).lean()
  );
  const plannedSources = new Set();

  await repairPurchaseOrders({ apply, result, transactionLookup, plannedSources });
  await repairVendorLedger({ apply, result, transactionLookup, plannedSources });
  await repairDiaries({ apply, result });
  await repairBankStatements({ apply, result });
  await repairPaidOrderFlags({ apply, result });
  await diagnoseAndRepairTransactions({ apply, result });

  // Stored balances are a cache of the journal. Rebuild them last so every
  // posting/link/account-id repair above is reflected exactly once.
  await reconcileAccountBalances({ apply, result });

  if (apply) {
    result.postAudit = await auditLedgerIntegrity({ sampleLimit: 20 });
  }

  return trimResult(result);
}

module.exports = {
  inferPaymentMode,
  vendorCandidateSources,
  buildTransactionLookup,
  findExistingVendorTransaction,
  repairLedgerIntegrity,
};
