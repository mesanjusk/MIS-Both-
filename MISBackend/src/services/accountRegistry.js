/**
 * accountRegistry.js
 *
 * Central ledger identity resolver.
 *
 * Party/customer ledgers live in Customers and are canonical for party names.
 * Accounts is reserved for chart-of-accounts / GL records. Historical versions
 * of this resolver auto-created a General/Asset Accounts row for any unknown
 * name; when that name was really a customer this created a duplicate "shadow"
 * ledger. New resolution now prefers the unique Customer record first and
 * ignores archived shadow Accounts.
 */

const { v4: uuid } = require('uuid');
const Accounts = require('../repositories/accounts');
const Customer = require('../repositories/customer');

const SYSTEM_ACCOUNT_META = Object.freeze({
  'cash':                  { type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',        code_hint: 1001 },
  'bank':                  { type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',        code_hint: 1002 },
  'upi':                   { type: 'Asset',     normal_balance_side: 'debit',  group: 'Cash & Bank',        code_hint: 1003 },
  'customer receivable':   { type: 'Asset',     normal_balance_side: 'debit',  group: 'Trade Receivables',  code_hint: 1100 },
  'customer advance':      { type: 'Liability', normal_balance_side: 'credit', group: 'Current Liabilities',code_hint: 2100 },
  'sales':                 { type: 'Income',    normal_balance_side: 'credit', group: 'Revenue',            code_hint: 4001 },
  'vendor payable':        { type: 'Liability', normal_balance_side: 'credit', group: 'Trade Payables',     code_hint: 2001 },
  'vendor advance':        { type: 'Asset',     normal_balance_side: 'debit',  group: 'Advances',           code_hint: 1200 },
  'job work expense':      { type: 'Expense',   normal_balance_side: 'debit',  group: 'Direct Costs',       code_hint: 5001 },
  'purchase':              { type: 'Expense',   normal_balance_side: 'debit',  group: 'Direct Costs',       code_hint: 5002 },
  'stock':                 { type: 'Asset',     normal_balance_side: 'debit',  group: 'Inventory',          code_hint: 1300 },
  'general expense':       { type: 'Expense',   normal_balance_side: 'debit',  group: 'Operating Expenses', code_hint: 5100 },
  'opening balance equity':{ type: 'Equity',    normal_balance_side: 'credit', group: 'Equity',             code_hint: 3001 },
});

const _nameToUuid = new Map();
const _uuidToName = new Map();
let _initialized = false;
let _initPromise = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeRegexLiteral = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

async function _init() {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const accounts = await Accounts.find({ Is_archived: { $ne: true } }).lean();
    for (const acct of accounts) {
      if (acct.Account_uuid && acct.Account_name) {
        _nameToUuid.set(acct.Account_name.toLowerCase(), acct.Account_uuid);
        _uuidToName.set(acct.Account_uuid, acct.Account_name);
      }
    }
    _initialized = true;
  })();

  return _initPromise;
}

function _invalidate() {
  _nameToUuid.clear();
  _uuidToName.clear();
  _initialized = false;
  _initPromise = null;
}

async function _nextAccountCode(codeHint) {
  if (codeHint) {
    const taken = await Accounts.findOne({ Account_code: codeHint, Is_archived: { $ne: true } }).lean();
    if (!taken) return codeHint;
  }
  const last = await Accounts.findOne({ Is_archived: { $ne: true } }, { Account_code: 1 })
    .sort({ Account_code: -1 })
    .lean();
  return Number(last?.Account_code || 1000) + 1;
}

function _metaFor(nameLower) {
  return SYSTEM_ACCOUNT_META[nameLower] || {
    type: 'Asset',
    normal_balance_side: 'debit',
    group: 'General',
    code_hint: null,
  };
}

async function _customersByExactName(raw) {
  const rows = await Customer.find(
    { Customer_name: { $regex: new RegExp('^' + escapeRegexLiteral(raw) + '$', 'i') } },
    { Customer_uuid: 1, Customer_name: 1 }
  ).limit(10).lean();
  return rows.filter((row) => row?.Customer_uuid && row?.Customer_name);
}

async function _uniqueCustomerByName(raw) {
  const valid = await _customersByExactName(raw);
  if (valid.length === 1) return valid[0];
  if (valid.length > 1) {
    const exactCase = valid.filter((row) => String(row.Customer_name).trim() === raw);
    if (exactCase.length === 1) return exactCase[0];
    throw Object.assign(
      new Error(`More than one Customer Report ledger named '${raw}' exists. Choose a unique customer before posting.`),
      { statusCode: 409 }
    );
  }
  return null;
}

/**
 * Resolve a name to a canonical ledger UUID.
 *
 * For non-system names a unique Customer Report ledger wins before Accounts.
 * This is the key guard that prevents another customer shadow Account from
 * being created. Genuine GL names still resolve/create in Accounts as before.
 */
async function getUuid(name) {
  await _init();

  const raw = String(name || '').trim();
  if (!raw) throw Object.assign(new Error('Account name must not be empty'), { statusCode: 400 });
  const key = raw.toLowerCase();
  const isKnownSystemName = Object.prototype.hasOwnProperty.call(SYSTEM_ACCOUNT_META, key);

  if (!isKnownSystemName) {
    const customer = await _uniqueCustomerByName(raw);
    if (customer) {
      _nameToUuid.set(key, customer.Customer_uuid);
      _uuidToName.set(customer.Customer_uuid, customer.Customer_name);
      return customer.Customer_uuid;
    }
  }

  if (_nameToUuid.has(key)) return _nameToUuid.get(key);

  const existing = await Accounts.findOne({
    Account_name: { $regex: new RegExp('^' + escapeRegexLiteral(raw) + '$', 'i') },
    Is_archived: { $ne: true },
  }).lean();
  if (existing?.Account_uuid) {
    _nameToUuid.set(key, existing.Account_uuid);
    _uuidToName.set(existing.Account_uuid, existing.Account_name);
    return existing.Account_uuid;
  }

  const meta = _metaFor(key);
  const acctUuid = uuid();
  const code = await _nextAccountCode(meta.code_hint);

  await Accounts.create({
    Account_uuid: acctUuid,
    Account_name: raw,
    Account_type: meta.type,
    Account_code: code,
    Normal_balance_side: meta.normal_balance_side,
    Account_group: meta.group,
    Is_system: isKnownSystemName,
    Balance: 0,
    Currency: 'INR',
    Created_at: new Date(),
    Updated_at: new Date(),
  });

  _nameToUuid.set(key, acctUuid);
  _uuidToName.set(acctUuid, raw);
  return acctUuid;
}

async function getName(accountUuid) {
  await _init();

  const key = String(accountUuid || '').trim();
  if (!key) return '';
  if (_uuidToName.has(key)) return _uuidToName.get(key);

  const cust = await Customer.findOne({ Customer_uuid: key }, { Customer_name: 1 }).lean();
  if (cust?.Customer_name) {
    _uuidToName.set(key, cust.Customer_name);
    return cust.Customer_name;
  }

  const acct = await Accounts.findOne({ Account_uuid: key }).lean();
  if (acct?.Is_archived && acct?.Replaced_by_customer_uuid) {
    const replacement = await Customer.findOne(
      { Customer_uuid: acct.Replaced_by_customer_uuid },
      { Customer_name: 1 }
    ).lean();
    if (replacement?.Customer_name) return replacement.Customer_name;
  }
  if (acct?.Account_name) {
    if (!acct.Is_archived) {
      _uuidToName.set(key, acct.Account_name);
      _nameToUuid.set(acct.Account_name.toLowerCase(), key);
    }
    return acct.Archived_account_name || acct.Account_name;
  }

  return key;
}

async function resolve(value) {
  const raw = String(value || '').trim();
  if (!raw) throw Object.assign(new Error('Account identifier must not be empty'), { statusCode: 400 });

  if (isUuid(raw)) {
    const customer = await Customer.findOne({ Customer_uuid: raw }, { Customer_uuid: 1, Customer_name: 1 }).lean();
    if (customer?.Customer_uuid) return { uuid: customer.Customer_uuid, name: customer.Customer_name || raw };

    const account = await Accounts.findOne({ Account_uuid: raw }).lean();
    if (account?.Is_archived && account?.Replaced_by_customer_uuid) {
      const replacement = await Customer.findOne(
        { Customer_uuid: account.Replaced_by_customer_uuid },
        { Customer_uuid: 1, Customer_name: 1 }
      ).lean();
      if (replacement?.Customer_uuid) {
        return { uuid: replacement.Customer_uuid, name: replacement.Customer_name || replacement.Customer_uuid };
      }
    }
    if (account?.Account_uuid && !account.Is_archived) {
      return { uuid: account.Account_uuid, name: account.Account_name || raw };
    }

    const name = await getName(raw);
    return { uuid: raw, name };
  }

  const resolvedUuid = await getUuid(raw);
  const name = await getName(resolvedUuid);
  return { uuid: resolvedUuid, name: name || raw };
}

/**
 * Resolve a ledger entity that may be either a GL account or Customer Report
 * party ledger. With preferCustomer=true only a unique customer name is used;
 * ambiguity is rejected rather than guessed.
 */
async function resolveLedgerEntity(value, { preferCustomer = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) throw Object.assign(new Error('Ledger identifier must not be empty'), { statusCode: 400 });

  if (isUuid(raw)) {
    const customer = await Customer.findOne({ Customer_uuid: raw }, { Customer_uuid: 1, Customer_name: 1 }).lean();
    if (customer?.Customer_uuid) return { uuid: customer.Customer_uuid, name: customer.Customer_name || raw, kind: 'customer' };
    const resolved = await resolve(raw);
    return { ...resolved, kind: 'account' };
  }

  if (preferCustomer) {
    const customer = await _uniqueCustomerByName(raw);
    if (customer) return { uuid: customer.Customer_uuid, name: customer.Customer_name, kind: 'customer' };
  }

  const resolved = await resolve(raw);
  const customer = await Customer.findOne({ Customer_uuid: resolved.uuid }, { Customer_uuid: 1 }).lean();
  return { ...resolved, kind: customer ? 'customer' : 'account' };
}

async function initialize() {
  return _init();
}

function invalidateCache() {
  _invalidate();
}

function lineDelta(entryType, amount, normalSide) {
  const side = String(normalSide || 'debit').toLowerCase();
  const isNormal = (entryType === 'Debit' && side === 'debit') ||
                   (entryType === 'Credit' && side === 'credit');
  return isNormal ? amount : -amount;
}

const round2 = (n) => Number(n.toFixed(2));

async function applyBalanceMovement({ reverse = [], apply = [] } = {}) {
  const lines = [...reverse, ...apply];
  const uuids = [...new Set(lines.map((l) => l && l.Account_id).filter(Boolean))];
  if (!uuids.length) return;

  const accounts = await Accounts.find({
    Account_uuid: { $in: uuids },
    Is_archived: { $ne: true },
  }).select('Account_uuid Normal_balance_side').lean();

  const sideByUuid = new Map(accounts.map((a) => [a.Account_uuid, a.Normal_balance_side]));
  const deltas = new Map();
  const collect = (entries, sign) => {
    for (const line of entries) {
      if (!line || !line.Account_id) continue;
      if (!sideByUuid.has(line.Account_id)) continue;
      const amount = Number(line.Amount);
      if (!Number.isFinite(amount)) continue;
      const delta = lineDelta(line.Type, amount, sideByUuid.get(line.Account_id)) * sign;
      deltas.set(line.Account_id, (deltas.get(line.Account_id) || 0) + delta);
    }
  };
  collect(reverse, -1);
  collect(apply, 1);

  const ops = [];
  for (const [Account_uuid, raw] of deltas) {
    const delta = round2(raw);
    if (delta === 0) continue;
    ops.push({
      updateOne: {
        filter: { Account_uuid, Is_archived: { $ne: true } },
        update: { $inc: { Balance: delta }, $set: { Updated_at: new Date() } },
      },
    });
  }
  if (!ops.length) return;
  await Accounts.bulkWrite(ops, { ordered: false });
}

async function updateBalance(accountUuid, entryType, amount) {
  return applyBalanceMovement({
    apply: [{ Account_id: accountUuid, Type: entryType, Amount: amount }],
  });
}

async function updateBalancesForJournal(journalLines = []) {
  return applyBalanceMovement({ apply: journalLines });
}

async function reverseBalancesForJournal(journalLines = []) {
  return applyBalanceMovement({ reverse: journalLines });
}

module.exports = {
  getUuid,
  getName,
  resolve,
  resolveLedgerEntity,
  isUuid,
  initialize,
  invalidateCache,
  updateBalance,
  updateBalancesForJournal,
  reverseBalancesForJournal,
  applyBalanceMovement,
  lineDelta,
  SYSTEM_ACCOUNT_META,
};
