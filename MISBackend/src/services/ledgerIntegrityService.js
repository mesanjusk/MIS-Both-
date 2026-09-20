'use strict';

const Transaction = require('../repositories/transaction');
const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');
const VendorLedger = require('../repositories/vendorLedger');
const DiaryDraft = require('../repositories/diaryDraft');
const BankStatement = require('../repositories/bankStatement');
const PurchaseOrder = require('../repositories/purchaseOrder');
const Orders = require('../repositories/order');
const { UpiPaymentAttempt } = require('../repositories/upiPaymentAttempt');

const round2 = (value) => Number(Number(value || 0).toFixed(2));

function orderTotal(order = {}) {
  for (const key of ['finalAmount', 'totalAmount', 'grandTotal', 'saleSubtotal', 'Amount']) {
    const value = round2(order[key]);
    if (value > 0) return value;
  }
  return round2((order.Items || []).reduce((sum, item) => sum + Number(item.Amount || 0), 0));
}

function journalProblem(txn) {
  const lines = Array.isArray(txn.Journal_entry) ? txn.Journal_entry : [];
  if (lines.length < 2) return 'journal has fewer than two lines';

  let debit = 0;
  let credit = 0;
  for (const [index, line] of lines.entries()) {
    const amount = Number(line?.Amount);
    if (!line?.Account_id) return `journal line ${index} has no Account_id`;
    if (!Number.isFinite(amount) || amount <= 0) return `journal line ${index} has invalid amount`;
    if (line.Type === 'Debit') debit += amount;
    else if (line.Type === 'Credit') credit += amount;
    else return `journal line ${index} has invalid Type`;
  }
  if (round2(debit) !== round2(credit)) return `debit ${round2(debit)} != credit ${round2(credit)}`;
  if (round2(txn.Total_Debit) !== round2(debit) || round2(txn.Total_Credit) !== round2(credit)) {
    return 'stored totals do not match journal totals';
  }
  return '';
}

async function auditLedgerIntegrity({ sampleLimit = 50 } = {}) {
  const [
    transactions,
    accounts,
    customers,
    vendorRows,
    diaries,
    statements,
    purchaseOrders,
    upiAttempts,
    paidOrders,
  ] = await Promise.all([
    Transaction.find({}).lean(),
    Accounts.find({}).lean(),
    Customer.find({}, { Customer_uuid: 1, Customer_name: 1 }).lean(),
    VendorLedger.find({ amount: { $gt: 0 } }).lean(),
    DiaryDraft.find({ status: 'confirmed' }).lean(),
    BankStatement.find({ 'entries.entry_status': 'confirmed' }).lean(),
    PurchaseOrder.find({}).lean(),
    UpiPaymentAttempt.find({ status: 'success' }).lean(),
    Orders.find({ billStatus: 'paid' }).lean(),
  ]);

  const txByUuid = new Map(transactions.filter((t) => t.Transaction_uuid).map((t) => [String(t.Transaction_uuid), t]));
  const txBySource = new Map();
  for (const txn of transactions) {
    const source = String(txn.Source || '');
    if (!source) continue;
    if (!txBySource.has(source)) txBySource.set(source, []);
    txBySource.get(source).push(txn);
  }

  const validAccountIds = new Set([
    ...accounts.map((a) => String(a.Account_uuid || '')).filter(Boolean),
    ...customers.map((c) => String(c.Customer_uuid || '')).filter(Boolean),
  ]);

  const issues = {
    invalidTransactions: [],
    unknownJournalAccounts: [],
    vendorLedgerWithoutTransaction: [],
    diaryWithoutTransaction: [],
    bankWithoutTransaction: [],
    activePurchaseOrderWithoutPosting: [],
    cancelledPurchaseOrderWithPosting: [],
    successfulUpiWithoutTransaction: [],
    paidOrderWithoutEnoughReceipts: [],
    accountBalanceDrift: [],
  };

  for (const txn of transactions) {
    const problem = journalProblem(txn);
    if (problem) {
      issues.invalidTransactions.push({
        transactionUuid: txn.Transaction_uuid,
        transactionId: txn.Transaction_id,
        source: txn.Source || '',
        problem,
      });
    }
    for (const line of txn.Journal_entry || []) {
      if (line?.Account_id && !validAccountIds.has(String(line.Account_id))) {
        issues.unknownJournalAccounts.push({
          transactionUuid: txn.Transaction_uuid,
          accountId: line.Account_id,
          accountName: line.Account_name || '',
        });
      }
    }
  }

  for (const row of vendorRows) {
    const txnUuid = String(row.transaction_uuid || '');
    if (!txnUuid || !txByUuid.has(txnUuid)) {
      issues.vendorLedgerWithoutTransaction.push({
        entryUuid: row.entry_uuid,
        vendorUuid: row.vendor_uuid,
        entryType: row.entry_type,
        amount: row.amount,
        transactionUuid: txnUuid,
      });
    }
  }

  for (const diary of diaries) {
    for (const entry of diary.entries || []) {
      if (entry.entry_status !== 'confirmed') continue;
      const txnUuid = String(entry.transaction_uuid || '');
      if (!txnUuid || !txByUuid.has(txnUuid)) {
        issues.diaryWithoutTransaction.push({
          diaryUuid: diary.diary_uuid,
          entryUuid: entry.entry_uuid,
          amount: entry.amount,
          transactionUuid: txnUuid,
        });
      }
    }
  }

  for (const statement of statements) {
    for (const entry of statement.entries || []) {
      if (entry.entry_status !== 'confirmed') continue;
      const txnUuid = String(entry.transaction_uuid || '');
      if (!txnUuid || !txByUuid.has(txnUuid)) {
        issues.bankWithoutTransaction.push({
          statementUuid: statement.statement_uuid,
          entryUuid: entry.entry_uuid,
          amount: Number(entry.credit || entry.debit || 0),
          transactionUuid: txnUuid,
        });
      }
    }
  }

  for (const po of purchaseOrders) {
    const total = round2(Number(po.totalAmount || 0) + (po.extraCharges || []).reduce((sum, charge) => sum + Number(charge.amount || 0), 0));
    if (!(total > 0)) continue;
    const source = `business:purchase:${po.PO_uuid}`;
    const posted = (txBySource.get(source) || []).length > 0;
    if (po.status === 'cancelled' && posted) {
      issues.cancelledPurchaseOrderWithPosting.push({ poUuid: po.PO_uuid, poNumber: po.PO_Number, total });
    } else if (po.status !== 'cancelled' && !posted) {
      issues.activePurchaseOrderWithoutPosting.push({ poUuid: po.PO_uuid, poNumber: po.PO_Number, total, status: po.status });
    }
  }

  for (const attempt of upiAttempts) {
    const txnUuid = String(attempt.transactionUuid || '');
    if (!txnUuid || !txByUuid.has(txnUuid)) {
      issues.successfulUpiWithoutTransaction.push({
        paymentUuid: attempt.payment_uuid,
        transactionRef: attempt.transactionRef,
        amount: attempt.amount,
        transactionUuid: txnUuid,
      });
    }
  }

  for (const order of paidOrders) {
    const total = orderTotal(order);
    if (!(total > 0)) continue;
    const relevant = transactions.filter((txn) =>
      (order.Order_uuid && String(txn.Order_uuid || '') === String(order.Order_uuid)) ||
      (order.Order_Number && Number(txn.Order_number) === Number(order.Order_Number))
    );
    const received = round2(relevant
      .filter((txn) => {
        const source = String(txn.Source || '');
        return source.startsWith('business:customer_receipt') || source.startsWith('business:customer_advance');
      })
      .reduce((sum, txn) => sum + Number(txn.Total_Debit || txn.Total_Credit || 0), 0));
    if (received + 0.009 < total) {
      issues.paidOrderWithoutEnoughReceipts.push({
        orderUuid: order.Order_uuid,
        orderNumber: order.Order_Number,
        total,
        received,
      });
    }
  }

  const accountByUuid = new Map(accounts.map((account) => [String(account.Account_uuid), account]));
  const movements = new Map();
  for (const txn of transactions) {
    for (const line of txn.Journal_entry || []) {
      const account = accountByUuid.get(String(line.Account_id || ''));
      if (!account) continue;
      const amount = Number(line.Amount || 0);
      const normal = String(account.Normal_balance_side || 'debit').toLowerCase();
      const onNormalSide =
        (line.Type === 'Debit' && normal === 'debit') ||
        (line.Type === 'Credit' && normal === 'credit');
      movements.set(account.Account_uuid, (movements.get(account.Account_uuid) || 0) + (onNormalSide ? amount : -amount));
    }
  }
  for (const account of accounts) {
    const expected = round2(movements.get(account.Account_uuid) || 0);
    const stored = round2(account.Balance || 0);
    if (expected !== stored) {
      issues.accountBalanceDrift.push({
        accountUuid: account.Account_uuid,
        accountName: account.Account_name,
        stored,
        expected,
        delta: round2(expected - stored),
      });
    }
  }

  const counts = Object.fromEntries(Object.entries(issues).map(([key, rows]) => [key, rows.length]));
  const totalIssues = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const samples = Object.fromEntries(
    Object.entries(issues).map(([key, rows]) => [key, rows.slice(0, sampleLimit)])
  );

  return {
    ok: totalIssues === 0,
    totalIssues,
    counts,
    scanned: {
      transactions: transactions.length,
      accounts: accounts.length,
      vendorLedgerRows: vendorRows.length,
      confirmedDiaries: diaries.length,
      bankStatements: statements.length,
      purchaseOrders: purchaseOrders.length,
      successfulUpiAttempts: upiAttempts.length,
      paidOrders: paidOrders.length,
    },
    samples,
  };
}

module.exports = {
  auditLedgerIntegrity,
  journalProblem,
  orderTotal,
};
