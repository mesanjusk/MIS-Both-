const Customer = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const { reverseBalancesForJournal } = require('./accountRegistry');

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ');

function sameUtcDay(a, b) {
  if (!a || !b) return true;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return true;
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

function expectedOpeningDate(customer) {
  if (customer?.Opening_balance_date) return customer.Opening_balance_date;
  return null;
}

function getCustomerOpeningLine(transaction, customer) {
  const uuid = String(customer?.Customer_uuid || '');
  if (!uuid) return null;
  return (transaction?.Journal_entry || []).find(
    (line) => String(line?.Account_id || '') === uuid
  ) || null;
}

function isCustomerOpeningBalanceCandidate(transaction, customer) {
  const amount = roundMoney(customer?.Opening_balance);
  if (!(amount > 0)) return false;

  const line = getCustomerOpeningLine(transaction, customer);
  if (!line || roundMoney(line.Amount) !== amount) return false;

  const expectedType = customer?.Opening_balance_type === 'credit' ? 'Credit' : 'Debit';
  if (String(line.Type || '') !== expectedType) return false;

  const description = normalize(transaction?.Description);
  const expectedDescription = normalize(`Opening balance - ${customer.Customer_name}`);
  const source = String(transaction?.Source || '');

  // Only touch transactions that explicitly identify themselves as an opening
  // balance. This keeps legacy/manual journals with the same amount untouched.
  const identifiedAsOpening =
    source === 'opening:balance' ||
    description === expectedDescription;
  if (!identifiedAsOpening) return false;

  if (!sameUtcDay(transaction?.Transaction_date, expectedOpeningDate(customer))) {
    return false;
  }

  return true;
}

function openingBalancePriority(transaction, customer) {
  let score = 0;
  if (String(transaction?.Source || '') === 'opening:balance') score += 10;
  if (String(transaction?.Customer_uuid || '') === String(customer?.Customer_uuid || '')) score += 20;
  const line = getCustomerOpeningLine(transaction, customer);
  if (line) score += 5;
  return score;
}

async function repairDuplicateCustomerOpeningBalances() {
  const customers = await Customer.find(
    { Opening_balance: { $gt: 0 }, Customer_uuid: { $ne: null } },
    {
      Customer_uuid: 1,
      Customer_name: 1,
      Opening_balance: 1,
      Opening_balance_type: 1,
      Opening_balance_date: 1,
    }
  ).lean();

  if (!customers.length) {
    return {
      customersScanned: 0,
      customersWithDuplicates: 0,
      duplicatesRemoved: 0,
      transactionIdsRemoved: [],
    };
  }

  const customerIds = customers.map((customer) => customer.Customer_uuid).filter(Boolean);
  const transactions = await Transaction.find({
    $or: [
      { 'Journal_entry.Account_id': { $in: customerIds } },
      { Customer_uuid: { $in: customerIds } },
    ],
  }).lean();

  let customersWithDuplicates = 0;
  let duplicatesRemoved = 0;
  const transactionIdsRemoved = [];

  for (const customer of customers) {
    const candidates = transactions
      .filter((transaction) => isCustomerOpeningBalanceCandidate(transaction, customer))
      .sort((a, b) => {
        const scoreDiff = openingBalancePriority(b, customer) - openingBalancePriority(a, customer);
        if (scoreDiff) return scoreDiff;
        const aCreated = new Date(a.createdAt || a.Transaction_date || 0).getTime();
        const bCreated = new Date(b.createdAt || b.Transaction_date || 0).getTime();
        return bCreated - aCreated;
      });

    if (candidates.length <= 1) continue;
    customersWithDuplicates += 1;

    // Keep exactly one canonical opening-balance posting. All remaining rows
    // represent the same customer/date/amount/side and are true duplicates.
    for (const duplicate of candidates.slice(1)) {
      const deletion = await Transaction.deleteOne({ _id: duplicate._id });
      if (!deletion.deletedCount) continue;

      await reverseBalancesForJournal(duplicate.Journal_entry || []);
      duplicatesRemoved += 1;
      transactionIdsRemoved.push(duplicate.Transaction_id);
    }
  }

  return {
    customersScanned: customers.length,
    customersWithDuplicates,
    duplicatesRemoved,
    transactionIdsRemoved,
  };
}

module.exports = {
  isCustomerOpeningBalanceCandidate,
  openingBalancePriority,
  repairDuplicateCustomerOpeningBalances,
};
