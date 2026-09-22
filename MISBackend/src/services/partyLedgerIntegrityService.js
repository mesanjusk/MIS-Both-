const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const {
  applyBalanceMovement,
  invalidateCache,
} = require('./accountRegistry');

const lower = (value) => String(value || '').trim().toLowerCase();

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

  // getUuid() historically auto-created unknown names as non-system,
  // Asset/debit, General accounts. Only those default-shape accounts are
  // candidates for automatic party-ledger repair.
  const shadowAccounts = await Accounts.find({
    Is_system: { $ne: true },
    Account_group: 'General',
    Account_type: 'Asset',
  }).lean();

  const shadowToCustomer = new Map();
  for (const account of shadowAccounts) {
    const matches = customerBuckets.get(lower(account.Account_name)) || [];
    if (matches.length !== 1) continue;
    const customer = matches[0];
    if (String(customer.Customer_uuid) === String(account.Account_uuid)) continue;
    shadowToCustomer.set(String(account.Account_uuid), customer);
  }

  if (!shadowToCustomer.size) {
    return {
      candidateShadowAccounts: 0,
      transactionsScanned: 0,
      transactionsRepaired: 0,
      journalLinesRepaired: 0,
    };
  }

  const shadowIds = [...shadowToCustomer.keys()];
  const transactions = await Transaction.find({
    Source: { $regex: /^(diary:|business:bank_statement:)/ },
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
    const nextJournal = previousJournal.map((line) => {
      const customer = shadowToCustomer.get(String(line.Account_id || ''));
      if (!customer) return line;

      // Name agreement is required as an extra safety check before changing
      // the foreign key. This prevents an unrelated reused UUID from moving.
      if (lower(line.Account_name) !== lower(customer.Customer_name)) return line;

      changed = true;
      journalLinesRepaired += 1;
      return {
        ...line,
        Account_id: customer.Customer_uuid,
        Account_name: customer.Customer_name,
      };
    });

    if (!changed) continue;

    // Use a conditional atomic update instead of document.save(). During a
    // zero-downtime deploy, another worker/user can touch the same transaction.
    // The shadow-id predicate makes this idempotent: once another process has
    // repaired the row, this update matches nothing and we do not reverse the
    // old cached balance a second time.
    const updateResult = await Transaction.updateOne(
      {
        _id: transaction._id,
        'Journal_entry.Account_id': { $in: shadowIds },
      },
      { $set: { Journal_entry: nextJournal } }
    );

    if (!updateResult.modifiedCount) continue;

    // Remove the cached movement from the obsolete shadow Accounts row.
    // Customer ledgers are derived from Transaction journal lines, so the new
    // Customer_uuid line does not need a separate Accounts.Balance update.
    await applyBalanceMovement({
      reverse: previousJournal,
      apply: nextJournal,
    });

    transactionsRepaired += 1;
  }

  invalidateCache();

  return {
    candidateShadowAccounts: shadowToCustomer.size,
    transactionsScanned: transactions.length,
    transactionsRepaired,
    journalLinesRepaired,
  };
}

module.exports = {
  repairShadowPartyJournalLines,
};
