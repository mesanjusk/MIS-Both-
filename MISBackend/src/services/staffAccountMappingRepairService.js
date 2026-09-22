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

  const accountById = new Map(
    accounts.filter((row) => row.Account_uuid).map((row) => [String(row.Account_uuid), row])
  );
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
    if (!account) continue;
    if (account.Is_system === true) continue;
    if (String(account.Account_group || '') !== 'General') continue;

    const matches = customerByName.get(norm(account.Account_name)) || [];
    if (matches.length !== 1) continue;

    candidates.push({
      user,
      account,
      customer: matches[0],
    });
  }

  let usersRemapped = 0;
  let transactionsRepaired = 0;
  let journalLinesRepaired = 0;

  for (const candidate of candidates) {
    const oldId = String(candidate.account.Account_uuid);
    const newId = String(candidate.customer.Customer_uuid);

    const transactions = await Transaction.find({
      'Journal_entry.Account_id': oldId,
    }).lean();

    for (const transaction of transactions) {
      const previousJournal = (transaction.Journal_entry || []).map((line) => ({
        Account_id: line.Account_id,
        Account_name: line.Account_name,
        Type: line.Type,
        Amount: line.Amount,
      }));

      let changed = false;
      const nextJournal = previousJournal.map((line) => {
        if (String(line.Account_id || '') !== oldId) return line;
        if (norm(line.Account_name) !== norm(candidate.account.Account_name)) return line;
        changed = true;
        journalLinesRepaired += 1;
        return {
          ...line,
          Account_id: newId,
          Account_name: candidate.customer.Customer_name,
        };
      });
      if (!changed) continue;

      const updateResult = await Transaction.updateOne(
        { _id: transaction._id, 'Journal_entry.Account_id': oldId },
        { $set: { Journal_entry: nextJournal } }
      );
      if (!updateResult.modifiedCount) continue;

      await applyBalanceMovement({
        reverse: previousJournal,
        apply: nextJournal,
      });
      transactionsRepaired += 1;
    }

    const alreadyUsedByAnother = await Users.findOne({
      _id: { $ne: candidate.user._id },
      AccountID: newId,
    }).select('_id').lean();

    if (!alreadyUsedByAnother) {
      const result = await Users.updateOne(
        { _id: candidate.user._id, AccountID: oldId },
        { $set: { AccountID: newId } }
      );
      if (result.modifiedCount) usersRemapped += 1;
    }
  }

  invalidateCache();

  return {
    candidates: candidates.map((candidate) => ({
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

module.exports = {
  repairStaffAccountMappings,
};
