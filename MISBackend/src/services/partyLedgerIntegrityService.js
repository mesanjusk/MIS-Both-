const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const { applyBalanceMovement, invalidateCache } = require('./accountRegistry');

const lower = (value) => String(value || '').trim().toLowerCase();

/**
 * Repair legacy shadow chart-of-account UUIDs across the ENTIRE transaction
 * journal. Account_name is only a display label; Account_id is ledger identity.
 *
 * Safety rules:
 * - only non-system default General/Asset accounts created by the historical
 *   name resolver are candidates;
 * - the shadow name must map to exactly one real Customer_uuid;
 * - the journal line display name must agree with that unique customer;
 * - ambiguous duplicate names are reported and never moved automatically;
 * - the update is conditional/idempotent and cached account movement is
 *   reversed only after the transaction was actually changed.
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
  if (!shadowIds.length) {
    return {
      accountsChecked: shadowAccounts.length,
      candidateShadowAccounts: 0,
      ambiguousAccounts,
      transactionsScanned: 0,
      transactionsRepaired: 0,
      journalLinesRepaired: 0,
    };
  }

  // IMPORTANT: intentionally no Source filter. Historical shadow UUIDs can
  // exist in bank, UPI, cash, diary, manual and other accounting workflows.
  const transactions = await Transaction.find({
    'Journal_entry.Account_id': { $in: shadowIds },
  });

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
  return {
    accountsChecked: shadowAccounts.length,
    candidateShadowAccounts: shadowToCustomer.size,
    ambiguousAccounts,
    transactionsScanned: transactions.length,
    transactionsRepaired,
    journalLinesRepaired,
  };
}

module.exports = { repairShadowPartyJournalLines };
