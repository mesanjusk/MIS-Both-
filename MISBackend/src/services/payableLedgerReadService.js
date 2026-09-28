// Read-only, indexed projection for the Home > Payable ledger.
// Keep the legacy /api/transaction route unchanged for other consumers.
const Customers = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const { ACCOUNT_PAYABLE_GROUP } = require('../constants/assignees');

const PAYABLE_TRANSACTION_FIELDS = Object.freeze({
  Transaction_uuid: 1,
  Transaction_id: 1,
  Transaction_date: 1,
  Description: 1,
  Payment_mode: 1,
  Source: 1,
  Order_number: 1,
  Journal_entry: 1,
});

async function getPayableLedgerTransactions() {
  // Same active-party source as /api/vendors/payable-parties. The UI previously
  // downloaded all transactions then discarded entries for other accounts.
  const parties = await Customers.find(
    { Status: 'active', Customer_group: ACCOUNT_PAYABLE_GROUP },
    { Customer_uuid: 1 },
  ).lean();
  const accountIds = [...new Set(parties.map((party) => party.Customer_uuid).filter(Boolean))];
  if (!accountIds.length) return [];

  // Transaction already indexes Journal_entry.Account_id. Return the complete
  // journal on each matching transaction; the UI handles multi-party journals
  // and must not lose their individual lines.
  return Transaction.find(
    { 'Journal_entry.Account_id': { $in: accountIds } },
    PAYABLE_TRANSACTION_FIELDS,
  ).sort({ Transaction_date: -1 }).lean();
}

module.exports = { PAYABLE_TRANSACTION_FIELDS, getPayableLedgerTransactions };
