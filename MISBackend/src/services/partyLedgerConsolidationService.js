const mongoose = require('mongoose');
const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const { invalidateCache } = require('./accountRegistry');

const norm = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

function db() {
  if (mongoose.connection.readyState !== 1) throw new Error('Database is not connected');
  return mongoose.connection.db;
}

async function candidateMap() {
  const [customers, accounts] = await Promise.all([
    Customer.find(
      { Customer_uuid: { $nin: [null, ''] }, Customer_name: { $nin: [null, ''] } },
      { Customer_uuid: 1, Customer_name: 1 }
    ).lean(),
    Accounts.find({
      Is_archived: { $ne: true },
      Is_system: { $ne: true },
      Account_group: 'General',
      Account_type: 'Asset',
    }).lean(),
  ]);

  const customersByName = new Map();
  for (const customer of customers) {
    const key = norm(customer.Customer_name);
    if (!key || !customer.Customer_uuid) continue;
    const list = customersByName.get(key) || [];
    list.push(customer);
    customersByName.set(key, list);
  }

  const candidates = [];
  const ambiguous = [];
  for (const account of accounts) {
    const matches = customersByName.get(norm(account.Account_name)) || [];
    if (matches.length > 1) {
      ambiguous.push({
        accountUuid: account.Account_uuid,
        accountName: account.Account_name,
        customerUuids: matches.map((row) => row.Customer_uuid),
      });
      continue;
    }
    if (matches.length !== 1) continue;
    const customer = matches[0];
    if (String(account.Account_uuid) === String(customer.Customer_uuid)) continue;
    candidates.push({ account, customer });
  }

  return { candidates, ambiguous, accountsChecked: accounts.length };
}

async function migrateEmbeddedAssignments(collection, oldUuid, oldName, customer) {
  const docs = await collection.find({
    $or: [
      { 'entries.account_assigned_uuid': oldUuid },
      { 'entries.account_assigned': { $exists: true } },
    ],
  }).toArray();

  let documentsChanged = 0;
  let entriesChanged = 0;
  for (const doc of docs) {
    let changed = false;
    const entries = (doc.entries || []).map((entry) => {
      const currentUuid = String(entry?.account_assigned_uuid || '').trim();
      const legacyName = String(entry?.account_assigned || '').trim();
      const matchesUuid = currentUuid === oldUuid;
      const matchesUnkeyedName = !currentUuid && legacyName && norm(legacyName) === norm(oldName);
      if (!matchesUuid && !matchesUnkeyedName) return entry;
      changed = true;
      entriesChanged += 1;
      return {
        ...entry,
        account_assigned: customer.Customer_name,
        account_assigned_uuid: customer.Customer_uuid,
        account_assigned_name: customer.Customer_name,
        account_assigned_type: 'customer',
      };
    });
    if (!changed) continue;
    const result = await collection.updateOne({ _id: doc._id }, { $set: { entries } });
    if (result.modifiedCount) documentsChanged += 1;
  }
  return { documentsChanged, entriesChanged };
}

async function migrateUsers(collection, oldUuid, oldName, customer) {
  const rows = await collection.find({
    $or: [
      { AccountID: oldUuid },
      { Ledger_account_uuid: oldUuid },
      { AccountID: { $exists: true } },
    ],
  }).toArray();
  let changed = 0;
  for (const row of rows) {
    const accountId = String(row.AccountID || '').trim();
    const ledgerUuid = String(row.Ledger_account_uuid || '').trim();
    const matches = accountId === oldUuid || ledgerUuid === oldUuid || (!ledgerUuid && norm(accountId) === norm(oldName));
    if (!matches) continue;
    const result = await collection.updateOne(
      { _id: row._id },
      {
        $set: {
          AccountID: customer.Customer_uuid,
          Ledger_account_uuid: customer.Customer_uuid,
        },
      }
    );
    changed += result.modifiedCount || 0;
  }
  return changed;
}

async function migrateStatementTopLevel(collection, oldUuid, customer) {
  const result = await collection.updateMany(
    { ledger_account_uuid: oldUuid },
    {
      $set: {
        ledger_account_uuid: customer.Customer_uuid,
        ledger_account_name: customer.Customer_name,
      },
    }
  );
  return result.modifiedCount || 0;
}

async function remainingReferenceCount(c, oldUuid) {
  const [journal, customerRef, users, diary, bankEntries, bankTop] = await Promise.all([
    c.transactions.countDocuments({ 'Journal_entry.Account_id': oldUuid }),
    c.transactions.countDocuments({ Customer_uuid: oldUuid }),
    c.users.countDocuments({ $or: [{ AccountID: oldUuid }, { Ledger_account_uuid: oldUuid }] }),
    c.diarydrafts.countDocuments({ 'entries.account_assigned_uuid': oldUuid }),
    c.bankstatements.countDocuments({ 'entries.account_assigned_uuid': oldUuid }),
    c.bankstatements.countDocuments({ ledger_account_uuid: oldUuid }),
  ]);
  return { journal, customerRef, users, diary, bankEntries, bankTop, total: journal + customerRef + users + diary + bankEntries + bankTop };
}

async function nextArchivedCode() {
  const row = await Accounts.findOne({ Account_code: { $lt: 0 } }, { Account_code: 1 })
    .sort({ Account_code: 1 })
    .lean();
  return Number(row?.Account_code || 0) - 1;
}

/**
 * Move historical party references from duplicate shadow Accounts to the one
 * canonical Customer Report ledger, then archive the shadow row in place.
 *
 * Nothing is deleted. An account is archived only after all known ledger
 * references have been moved and rechecked. Ambiguous customer names are never
 * touched. The archived record keeps its original name/code in dedicated audit
 * fields and receives an inert unique name/code so it cannot collide with live
 * accounting or manual-review search.
 */
async function consolidateShadowPartyAccounts() {
  const database = db();
  const c = {
    transactions: database.collection('transactions'),
    users: database.collection('users'),
    diarydrafts: database.collection('diarydrafts'),
    bankstatements: database.collection('bankstatements'),
  };

  const { candidates, ambiguous, accountsChecked } = await candidateMap();
  let archiveCode = await nextArchivedCode();
  const summary = {
    accountsChecked,
    candidates: candidates.length,
    ambiguous,
    archived: 0,
    skippedWithReferences: [],
    transactionCustomerRefsMoved: 0,
    usersMoved: 0,
    diaryEntriesMoved: 0,
    bankEntriesMoved: 0,
    bankStatementsMoved: 0,
  };

  for (const { account, customer } of candidates) {
    const oldUuid = String(account.Account_uuid || '');
    if (!oldUuid) continue;

    // Journal lines are intentionally handled by repairShadowPartyJournalLines
    // immediately before this consolidation during startup. Here we migrate the
    // remaining non-journal identity references.
    const txCustomer = await c.transactions.updateMany(
      { Customer_uuid: oldUuid },
      { $set: { Customer_uuid: customer.Customer_uuid } }
    );
    summary.transactionCustomerRefsMoved += txCustomer.modifiedCount || 0;

    summary.usersMoved += await migrateUsers(c.users, oldUuid, account.Account_name, customer);

    const diary = await migrateEmbeddedAssignments(
      c.diarydrafts,
      oldUuid,
      account.Account_name,
      customer
    );
    summary.diaryEntriesMoved += diary.entriesChanged;

    const bank = await migrateEmbeddedAssignments(
      c.bankstatements,
      oldUuid,
      account.Account_name,
      customer
    );
    summary.bankEntriesMoved += bank.entriesChanged;
    summary.bankStatementsMoved += await migrateStatementTopLevel(c.bankstatements, oldUuid, customer);

    const remaining = await remainingReferenceCount(c, oldUuid);
    if (remaining.total > 0) {
      summary.skippedWithReferences.push({
        accountUuid: oldUuid,
        accountName: account.Account_name,
        replacementCustomerUuid: customer.Customer_uuid,
        remaining,
      });
      continue;
    }

    const archivedName = `__archived_party__${oldUuid}`;
    const archivedAt = new Date();
    const update = await Accounts.updateOne(
      { _id: account._id, Is_archived: { $ne: true } },
      {
        $set: {
          Is_archived: true,
          Archived_at: archivedAt,
          Archived_reason: 'shadow_party_account_replaced_by_customer_report',
          Archived_account_name: account.Account_name,
          Archived_account_code: account.Account_code,
          Replaced_by_customer_uuid: customer.Customer_uuid,
          Replaced_by_customer_name: customer.Customer_name,
          Account_name: archivedName,
          Account_name_key: archivedName.toLowerCase(),
          Account_code: archiveCode,
          Updated_at: archivedAt,
        },
      }
    );
    if (update.modifiedCount) {
      summary.archived += 1;
      archiveCode -= 1;
    }
  }

  invalidateCache();
  return summary;
}

module.exports = {
  consolidateShadowPartyAccounts,
  candidateMap,
};
