const mongoose = require('mongoose');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve an existing ledger entity without creating anything.
 *
 * This is intentionally stricter than accountRegistry.resolve(): assignment
 * backfills must never create a shadow account just because a legacy display
 * name cannot be matched. Ambiguous names return null.
 */
async function resolveExistingLedgerIdentity(value) {
  const raw = String(value || '').trim();
  if (!raw || mongoose.connection.readyState !== 1) return null;

  const accounts = mongoose.connection.collection('accounts');
  const customers = mongoose.connection.collection('customers');

  if (UUID_RE.test(raw)) {
    const [account, customer] = await Promise.all([
      accounts.findOne({ Account_uuid: raw }, { projection: { Account_uuid: 1, Account_name: 1 } }),
      customers.findOne({ Customer_uuid: raw }, { projection: { Customer_uuid: 1, Customer_name: 1 } }),
    ]);
    if (account && !customer) return { uuid: raw, name: account.Account_name || raw, type: 'account' };
    if (customer && !account) return { uuid: raw, name: customer.Customer_name || raw, type: 'customer' };
    if (account && customer) return null;
    return null;
  }

  const exact = new RegExp(`^${escapeRegex(raw)}$`, 'i');
  const [accountMatches, customerMatches] = await Promise.all([
    accounts.find(
      { Account_name: exact },
      { projection: { Account_uuid: 1, Account_name: 1 } }
    ).limit(2).toArray(),
    customers.find(
      { Customer_name: exact },
      { projection: { Customer_uuid: 1, Customer_name: 1 } }
    ).limit(2).toArray(),
  ]);

  const candidates = [
    ...accountMatches.filter((row) => row.Account_uuid).map((row) => ({
      uuid: row.Account_uuid,
      name: row.Account_name || raw,
      type: 'account',
    })),
    ...customerMatches.filter((row) => row.Customer_uuid).map((row) => ({
      uuid: row.Customer_uuid,
      name: row.Customer_name || raw,
      type: 'customer',
    })),
  ];

  const byUuid = new Map(candidates.map((candidate) => [candidate.uuid, candidate]));
  return byUuid.size === 1 ? [...byUuid.values()][0] : null;
}

async function backfillEmbeddedLedgerIdentities(entries = []) {
  const cache = new Map();
  let changed = false;

  for (const entry of entries) {
    if (!entry) continue;
    if (String(entry.account_assigned_uuid || '').trim()) continue;
    const legacy = String(entry.account_assigned || '').trim();
    if (!legacy) continue;

    const key = legacy.toLowerCase();
    if (!cache.has(key)) cache.set(key, await resolveExistingLedgerIdentity(legacy));
    const resolved = cache.get(key);
    if (!resolved) continue;

    entry.account_assigned_uuid = resolved.uuid;
    entry.account_assigned_name = resolved.name;
    entry.account_assigned_type = resolved.type;
    changed = true;
  }

  return changed;
}

module.exports = {
  resolveExistingLedgerIdentity,
  backfillEmbeddedLedgerIdentities,
};
