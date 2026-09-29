// Read-only ledger reconciliation for customer-level follow-ups.
// Transactions remain the financial source of truth; this never posts money.
const Customers = require('../repositories/customer');
const Transaction = require('../repositories/transaction');

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const unique = (values) => [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
const indiaDay = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

async function getReceivableBalances(customerUuids) {
  const ids = unique(customerUuids);
  const result = new Map();
  if (!ids.length) return result;
  // Journal Account_id is the indexed ledger identity. A transaction's
  // other account lines must NOT contribute to this customer's balance.
  const rows = await Transaction.aggregate([
    { $match: { 'Journal_entry.Account_id': { $in: ids } } },
    { $unwind: '$Journal_entry' },
    { $match: { 'Journal_entry.Account_id': { $in: ids } } },
    { $group: {
      _id: '$Journal_entry.Account_id',
      debit: { $sum: { $cond: [
        { $eq: [{ $toLower: { $ifNull: ['$Journal_entry.Type', ''] } }, 'debit'] },
        { $ifNull: ['$Journal_entry.Amount', 0] }, 0,
      ] } },
      credit: { $sum: { $cond: [
        { $eq: [{ $toLower: { $ifNull: ['$Journal_entry.Type', ''] } }, 'credit'] },
        { $ifNull: ['$Journal_entry.Amount', 0] }, 0,
      ] } },
    } },
  ]);
  rows.forEach((row) => result.set(String(row._id), money(row.debit - row.credit)));
  return result;
}

function followupWithBalance(record, customer = null, rawBalance = null, now = new Date()) {
  const amount = money(record.amount);
  const baseline = money(record.baseline_outstanding);
  const hasLedger = Boolean(customer?.Customer_uuid && Number.isFinite(rawBalance));
  const liveOutstanding = hasLedger ? Math.max(0, money(rawBalance)) : null;

  // For new records, protect other pre-existing outstanding from being
  // mistaken for this follow-up. This is a customer-level estimate, NOT an
  // invoice-level allocation of individual receipts.
  const reserve = baseline > 0 ? Math.max(0, money(baseline - amount)) : 0;
  const remainingAmount = hasLedger
    ? money(Math.min(amount, Math.max(0, liveOutstanding - reserve)))
    : amount;

  // Legacy name-only records with no baseline cannot safely be auto-closed.
  const autoSettled = record.status !== 'done' && baseline > 0 && hasLedger && remainingAmount <= 0;
  const effectiveStatus = record.status === 'done' || autoSettled ? 'done' : 'pending';
  const dueDate = new Date(record.followup_date);
  const validDate = !Number.isNaN(dueDate.getTime());
  const today = indiaDay(now);
  const date = validDate ? indiaDay(dueDate) : '';
  return {
    ...record,
    customer_uuid: record.customer_uuid || customer?.Customer_uuid || '',
    customer_mobile: customer?.Mobile_number || '',
    liveOutstanding,
    remainingAmount,
    autoSettled,
    effectiveStatus,
    overdue: effectiveStatus === 'pending' && Boolean(date) && date < today,
    dueToday: effectiveStatus === 'pending' && date === today,
  };
}

async function enrichFollowups(records, now = new Date()) {
  if (!records.length) return [];
  const customerUuids = unique(records.map((record) => record.customer_uuid));
  const legacyNames = unique(records.filter((r) => !r.customer_uuid).map((r) => r.customer_name));
  const clauses = [];
  if (customerUuids.length) clauses.push({ Customer_uuid: { $in: customerUuids } });
  if (legacyNames.length) clauses.push({ Customer_name: { $in: legacyNames } });
  const customers = clauses.length
    ? await Customers.find({ $or: clauses }, { Customer_uuid: 1, Customer_name: 1, Mobile_number: 1 }).lean()
    : [];
  const byUuid = new Map(customers.map((customer) => [String(customer.Customer_uuid), customer]));
  const byName = new Map();
  customers.forEach((customer) => {
    const name = String(customer.Customer_name || '').trim().toLowerCase();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(customer);
  });
  const matchingCustomer = (record) => {
    if (record.customer_uuid) return byUuid.get(String(record.customer_uuid)) || null;
    const candidates = byName.get(String(record.customer_name || '').trim().toLowerCase()) || [];
    return candidates.length === 1 ? candidates[0] : null;
  };
  const resolved = records.map(matchingCustomer);
  const balances = await getReceivableBalances(resolved.map((customer) => customer?.Customer_uuid));
  return records.map((record, index) => {
    const customer = resolved[index];
    return followupWithBalance(
      record, customer,
      customer ? (balances.get(String(customer.Customer_uuid)) ?? 0) : null, now,
    );
  });
}

module.exports = { getReceivableBalances, followupWithBalance, enrichFollowups, indiaDay, money };
