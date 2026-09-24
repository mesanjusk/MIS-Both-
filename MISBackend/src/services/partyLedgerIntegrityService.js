const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const { applyBalanceMovement, invalidateCache } = require('./accountRegistry');
const { consolidateShadowPartyAccounts } = require('./partyLedgerConsolidationService');

const lower = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Repair legacy shadow chart-of-account UUIDs across the ENTIRE transaction
 * journal, then consolidate the remaining non-journal references and archive
 * shadow party Accounts that have been fully replaced by Customer Report.
 *
 * Safety rules:
 * - only active, non-system default General/Asset accounts are candidates;
 * - the shadow name must map to exactly one real Customer_uuid;
 * - the journal line display name must agree with that unique customer;
 * - ambiguous duplicate names are reported and never moved automatically;
 * - amounts, debit/credit types and totals are never changed;
 * - shadow Accounts are archived only after known references are rechecked.
 */
async function repairShadowPartyJournalLines() {
  const customers = await Customer.find(
    { Customer_uuid: { $ne: null }, Customer_name: { $ne: '' } },
    { Customer_uuid: 1, Customer_name: 1 }
  ).lean();

  const customerBuckets = new Map();
  for (const customer of customers) {
    const key = lower(customer.Customer_name);
    if (!key || !customer.Customer_uuid) continue;
    const bucket = customerBuckets.get(key) || [];
    bucket.push(customer);
    customerBuckets.set(key, bucket);
  }

  const shadowAccounts = await Accounts.find({
    Is_archived: { $ne: true },
    Is_system: { $ne: true },
    Account_group: 'General',
    Account_type: 'Asset',
  }).lean();

  const shadowToCustomer = new Map();
  const ambiguousAccounts = [];
  for (const account of shadowAccounts) {
    const matches = customerBuckets.get(lower(account.Account_name)) || [];
    if (matches.length > 1) {
      ambiguousAccounts.push({
        accountUuid: account.Account_uuid,
        accountName: account.Account_name,
        customerUuids: matches.map((item) => item.Customer_uuid),
      });
      continue;
    }
    if (matches.length !== 1) continue;
    const customer = matches[0];
    if (String(customer.Customer_uuid) === String(account.Account_uuid)) continue;
    shadowToCustomer.set(String(account.Account_uuid), customer);
  }

  const shadowIds = [...shadowToCustomer.keys()];
  const transactions = shadowIds.length
    ? await Transaction.find({ 'Journal_entry.Account_id': { $in: shadowIds } })
    : [];

  let transactionsRepaired = 0;
  let journalLinesRepaired = 0;

  for (const transaction of transactions) {
    const previousJournal = (transaction.Journal_entry || []).map((line) => ({
      Account_id: line.Account_id,
      Account_name: line.Account_name,
      Type: line.Type,
      Amount: line.Amount,
    }));

    let changed = false;
    let changedLines = 0;
    const nextJournal = previousJournal.map((line) => {
      const customer = shadowToCustomer.get(String(line.Account_id || ''));
      if (!customer) return line;
      if (lower(line.Account_name) !== lower(customer.Customer_name)) return line;
      changed = true;
      changedLines += 1;
      return {
        ...line,
        Account_id: customer.Customer_uuid,
        Account_name: customer.Customer_name,
      };
    });

    if (!changed) continue;

    const updateResult = await Transaction.updateOne(
      {
        _id: transaction._id,
        'Journal_entry.Account_id': { $in: shadowIds },
      },
      { $set: { Journal_entry: nextJournal } }
    );
    if (!updateResult.modifiedCount) continue;

    await applyBalanceMovement({ reverse: previousJournal, apply: nextJournal });
    transactionsRepaired += 1;
    journalLinesRepaired += changedLines;
  }

  invalidateCache();

  // This second phase moves User/Diary/Bank/customer references and archives
  // only shadow rows that no longer have any known live reference. It is
  // idempotent, so startup can safely run it on every deploy.
  const consolidation = await consolidateShadowPartyAccounts();

  return {
    accountsChecked: shadowAccounts.length,
    candidateShadowAccounts: shadowToCustomer.size,
    ambiguousAccounts,
    transactionsScanned: transactions.length,
    transactionsRepaired,
    journalLinesRepaired,
    consolidation,
  };
}

module.exports = { repairShadowPartyJournalLines };
