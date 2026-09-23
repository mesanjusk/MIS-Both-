const Users = require('../repositories/users');
const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const { applyBalanceMovement, invalidateCache } = require('./accountRegistry');

const norm = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function repairStaffAccountMappings() {
  const [users, accounts, customers] = await Promise.all([
    Users.find({ AccountID: { $nin: [null, ''] } }).select('_id User_uuid User_name AccountID operations.active').lean(),
    Accounts.find({}).select('Account_uuid Account_name Account_group Is_system').lean(),
    Customer.find({}).select('Customer_uuid Customer_name Customer_group').lean(),
  ]);

  const accountById = new Map(accounts.filter(r => r.Account_uuid).map(r => [String(r.Account_uuid), r]));
  const customerById = new Map(customers.filter(r => r.Customer_uuid).map(r => [String(r.Customer_uuid), r]));
  const customerByName = new Map();
  for (const customer of customers) {
    const key = norm(customer.Customer_name);
    if (!key || !customer.Customer_uuid) continue;
    const list = customerByName.get(key) || [];
    list.push(customer);
    customerByName.set(key, list);
  }

  const candidates = [];
  for (const user of users) {
    if (user?.operations?.active === false) continue;
    const account = accountById.get(String(user.AccountID || ''));
    if (!account || account.Is_system === true || String(account.Account_group || '') !== 'General') continue;
    const matches = customerByName.get(norm(account.Account_name)) || [];
    if (matches.length === 1) candidates.push({ user, account, customer: matches[0] });
  }

  let usersRemapped = 0;
  let transactionsRepaired = 0;
  let journalLinesRepaired = 0;

  // First migrate legacy staff shadow-account UUIDs to the real party UUID.
  // Account_name is deliberately NOT used as a filter: UUID is the ledger identity.
  for (const candidate of candidates) {
    const oldId = String(candidate.account.Account_uuid);
    const newId = String(candidate.customer.Customer_uuid);
    const transactions = await Transaction.find({ 'Journal_entry.Account_id': oldId }).lean();

    for (const transaction of transactions) {
      const previousJournal = (transaction.Journal_entry || []).map(line => ({
        Account_id: line.Account_id, Account_name: line.Account_name, Type: line.Type, Amount: line.Amount,
      }));
      let changed = false;
      const nextJournal = previousJournal.map(line => {
        if (String(line.Account_id || '') !== oldId) return line;
        changed = true;
        journalLinesRepaired += 1;
        return { ...line, Account_id: newId, Account_name: candidate.customer.Customer_name };
      });
      if (!changed) continue;
      const updateResult = await Transaction.updateOne({ _id: transaction._id }, { $set: { Journal_entry: nextJournal } });
      if (!updateResult.modifiedCount) continue;
      await applyBalanceMovement({ reverse: previousJournal, apply: nextJournal });
      transactionsRepaired += 1;
    }

    const alreadyUsedByAnother = await Users.findOne({ _id: { $ne: candidate.user._id }, AccountID: newId }).select('_id').lean();
    if (!alreadyUsedByAnother) {
      const result = await Users.updateOne({ _id: candidate.user._id, AccountID: oldId }, { $set: { AccountID: newId } });
      if (result.modifiedCount) usersRemapped += 1;
    }
  }

  // Repair the corruption visible in legacy rows where a journal line carries
  // one UUID but the stored Account_name is the exact unique name of a different
  // customer. Names are used only to discover this old corruption; after repair
  // the UUID is authoritative everywhere. Limit this to active staff party names
  // so normal counter-account labels are never reclassified.
  const activeStaffNames = new Set(users.filter(u => u?.operations?.active !== false).map(u => norm(u.User_name)).filter(Boolean));
  const staffCustomersByName = new Map();
  for (const customer of customers) {
    const key = norm(customer.Customer_name);
    if (!activeStaffNames.has(key)) continue;
    const matches = customerByName.get(key) || [];
    if (matches.length === 1) staffCustomersByName.set(key, customer);
  }

  const suspicious = await Transaction.find({
    'Journal_entry.Account_name': { $in: Array.from(staffCustomersByName.values()).map(c => c.Customer_name) },
  }).lean();

  for (const transaction of suspicious) {
    const previousJournal = (transaction.Journal_entry || []).map(line => ({
      Account_id: line.Account_id, Account_name: line.Account_name, Type: line.Type, Amount: line.Amount,
    }));
    let changed = false;
    const nextJournal = previousJournal.map(line => {
      const target = staffCustomersByName.get(norm(line.Account_name));
      if (!target) return line;
      const targetId = String(target.Customer_uuid);
      const currentId = String(line.Account_id || '');
      if (currentId === targetId) return { ...line, Account_name: target.Customer_name };
      const currentCustomer = customerById.get(currentId);
      const currentAccount = accountById.get(currentId);
      // Only repair a conflicting UUID when the line explicitly names the staff
      // party and the current UUID belongs to another known ledger entity.
      if (!currentCustomer && !currentAccount) return line;
      changed = true;
      journalLinesRepaired += 1;
      return { ...line, Account_id: targetId, Account_name: target.Customer_name };
    });
    if (!changed) continue;
    const updateResult = await Transaction.updateOne({ _id: transaction._id }, { $set: { Journal_entry: nextJournal } });
    if (!updateResult.modifiedCount) continue;
    await applyBalanceMovement({ reverse: previousJournal, apply: nextJournal });
    transactionsRepaired += 1;
  }

  invalidateCache();
  return {
    candidates: candidates.map(candidate => ({
      user: candidate.user.User_name,
      fromAccountUuid: candidate.account.Account_uuid,
      fromAccountName: candidate.account.Account_name,
      toCustomerUuid: candidate.customer.Customer_uuid,
      toCustomerName: candidate.customer.Customer_name,
    })),
    usersRemapped,
    transactionsRepaired,
    journalLinesRepaired,
  };
}

module.exports = { repairStaffAccountMappings };
