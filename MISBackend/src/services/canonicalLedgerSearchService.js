const mongoose = require('mongoose');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

function collections() {
  if (mongoose.connection.readyState !== 1) throw new Error('Database is not connected');
  const db = mongoose.connection.db;
  return {
    accounts: db.collection('accounts'),
    customers: db.collection('customers'),
  };
}

async function customerCatalog() {
  const c = collections();
  const rows = await c.customers.find(
    { Customer_uuid: { $nin: [null, ''] } },
    { projection: { Customer_uuid: 1, Customer_name: 1, Customer_group: 1 } }
  ).toArray();
  return rows
    .filter((row) => isUuid(row.Customer_uuid))
    .map((row) => ({
      uuid: row.Customer_uuid,
      name: row.Customer_name || row.Customer_uuid,
      type: 'customer',
      code: row.Customer_group || '',
      source: 'Customer Report',
    }));
}

async function activeGlCatalog() {
  const c = collections();
  const [accounts, customers] = await Promise.all([
    c.accounts.find(
      { Is_archived: { $ne: true } },
      { projection: { Account_uuid: 1, Account_name: 1, Account_code: 1, Account_type: 1, Account_group: 1, Is_system: 1 } }
    ).toArray(),
    c.customers.find(
      { Customer_uuid: { $nin: [null, ''] } },
      { projection: { Customer_uuid: 1, Customer_name: 1 } }
    ).toArray(),
  ]);

  const customerNames = new Set(customers.map((row) => norm(row.Customer_name)).filter(Boolean));
  return accounts
    .filter((row) => isUuid(row.Account_uuid))
    // A non-system General/Asset account with the same name as a Customer is a
    // historical shadow candidate and must never be offered as a live choice.
    .filter((row) => !(
      row.Is_system !== true &&
      row.Account_group === 'General' &&
      row.Account_type === 'Asset' &&
      customerNames.has(norm(row.Account_name))
    ))
    .map((row) => ({
      uuid: row.Account_uuid,
      name: row.Account_name || row.Account_uuid,
      type: 'account',
      code: row.Account_code ?? '',
      group: row.Account_group || '',
      source: 'System / GL',
    }));
}

function filterRows(rows, query, limit) {
  const q = norm(query);
  const filtered = q
    ? rows.filter((row) =>
      norm(row.name).includes(q) ||
      norm(row.uuid).includes(q) ||
      norm(row.code).includes(q) ||
      norm(row.group).includes(q)
    )
    : rows;
  return filtered.slice(0, Math.max(1, Math.min(100, Number(limit) || 40)));
}

async function searchPartyLedgers(query = '', limit = 40) {
  return filterRows(await customerCatalog(), query, limit);
}

async function searchAccountingLedgers(query = '', limit = 40) {
  const [customers, accounts] = await Promise.all([customerCatalog(), activeGlCatalog()]);
  return filterRows([...customers, ...accounts], query, limit);
}

async function getCustomerLedger(uuid) {
  if (!isUuid(uuid)) return null;
  const c = collections();
  const row = await c.customers.findOne(
    { Customer_uuid: uuid },
    { projection: { Customer_uuid: 1, Customer_name: 1, Customer_group: 1 } }
  );
  if (!row) return null;
  return {
    uuid: row.Customer_uuid,
    name: row.Customer_name || row.Customer_uuid,
    type: 'customer',
    code: row.Customer_group || '',
    source: 'Customer Report',
  };
}

module.exports = {
  searchPartyLedgers,
  searchAccountingLedgers,
  getCustomerLedger,
};
