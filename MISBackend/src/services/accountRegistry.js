/**
 * accountRegistry.js
 *
 * Singleton service that maps account names ↔ Account_uuid values stored in the
 * Accounts collection.  All accounting posting functions must obtain UUIDs from
 * here instead of embedding raw account-name strings in transaction records.
 *
 * Guarantees:
 *   - Every known account name resolves to a stable UUID.
 *   - If an account does not yet exist in the DB it is auto-created with sensible
 *     defaults (type, code, normal-balance side).
 *   - Cache is invalidated after write operations so subsequent reads are fresh.
 */

const { v4: uuid } = require('uuid');
const Accounts = require('../repositories/accounts');

// ---------------------------------------------------------------------------
// System-account metadata: name → { type, normal_balance_side, group }
// ---------------------------------------------------------------------------
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

// In-memory caches ─ refreshed lazily
const _nameToUuid = new Map(); // lowercased name → uuid
const _uuidToName = new Map(); // uuid → canonical name

let _initialized = false;
let _initPromise  = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _init() {
  if (_initialized) return;
  if (_initPromise)  return _initPromise;

  _initPromise = (async () => {
    const accounts = await Accounts.find({}).lean();
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
  _initPromise  = null;
}

async function _nextAccountCode(codeHint) {
  if (codeHint) {
    // Use hint if not already taken
    const taken = await Accounts.findOne({ Account_code: codeHint }).lean();
    if (!taken) return codeHint;
  }
  const last = await Accounts.findOne({}, { Account_code: 1 }).sort({ Account_code: -1 }).lean();
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve an account name to its Account_uuid.
 * Auto-creates the account in the DB if it does not exist.
 *
 * @param {string} name - Human-readable account name (case-insensitive).
 * @returns {Promise<string>} Account_uuid
 */
async function getUuid(name) {
  await _init();

  const raw = String(name || '').trim();
  if (!raw) throw Object.assign(new Error('Account name must not be empty'), { statusCode: 400 });

  const key = raw.toLowerCase();

  // 1. Cache hit
  if (_nameToUuid.has(key)) return _nameToUuid.get(key);

  // 2. DB lookup (cache may be cold / stale)
  const existing = await Accounts.findOne({ Account_name: { $regex: new RegExp(`^${raw}$`, 'i') } }).lean();
  if (existing?.Account_uuid) {
    _nameToUuid.set(key, existing.Account_uuid);
    _uuidToName.set(existing.Account_uuid, existing.Account_name);
    return existing.Account_uuid;
  }

  // 3. Auto-create
  const meta     = _metaFor(key);
  const acctUuid = uuid();
  const code     = await _nextAccountCode(meta.code_hint);

  await Accounts.create({
    Account_uuid:        acctUuid,
    Account_name:        raw,
    Account_type:        meta.type,
    Account_code:        code,
    Normal_balance_side: meta.normal_balance_side,
    Account_group:       meta.group,
    Is_system:           Object.prototype.hasOwnProperty.call(SYSTEM_ACCOUNT_META, key),
    Balance:             0,
    Currency:            'INR',
    Created_at:          new Date(),
    Updated_at:          new Date(),
  });

  _nameToUuid.set(key, acctUuid);
  _uuidToName.set(acctUuid, raw);
  return acctUuid;
}

/**
 * Resolve an Account_uuid back to its human-readable name.
 * Returns the UUID itself as a safe fallback when not found.
 *
 * @param {string} accountUuid
 * @returns {Promise<string>} Account_name or accountUuid fallback
 */
async function getName(accountUuid) {
  await _init();

  const key = String(accountUuid || '').trim();
  if (!key) return '';

  if (_uuidToName.has(key)) return _uuidToName.get(key);

  const acct = await Accounts.findOne({ Account_uuid: key }).lean();
  if (acct?.Account_name) {
    _uuidToName.set(key, acct.Account_name);
    _nameToUuid.set(acct.Account_name.toLowerCase(), key);
    return acct.Account_name;
  }

  return key; // fallback: return UUID itself
}

/**
 * True when the value looks like a UUID (v4 hex format).
 * Used by callers that need to distinguish "already a UUID" from "account name".
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

/**
 * Resolve a value that is either already a UUID or an account name.
 * Returns { uuid, name } pair.
 *
 * @param {string} value - UUID or account name
 * @returns {Promise<{uuid: string, name: string}>}
 */
async function resolve(value) {
  const raw = String(value || '').trim();
  if (!raw) throw Object.assign(new Error('Account identifier must not be empty'), { statusCode: 400 });

  if (isUuid(raw)) {
    const name = await getName(raw);
    return { uuid: raw, name };
  }
  const resolvedUuid = await getUuid(raw);
  return { uuid: resolvedUuid, name: raw };
}

/**
 * Warm-up the cache (called at server startup).
 */
async function initialize() {
  return _init();
}

/**
 * Force-clear the cache (useful after bulk migrations).
 */
function invalidateCache() {
  _invalidate();
}

/**
 * Update account balance after a transaction journal line is posted.
 * Uses Normal_balance_side to determine direction.
 *
 * @param {string} accountUuid
 * @param {'Debit'|'Credit'} entryType
 * @param {number} amount
 */
async function updateBalance(accountUuid, entryType, amount) {
  const acct = await Accounts.findOne({ Account_uuid: accountUuid }).lean();
  if (!acct) return;

  const normalSide = String(acct.Normal_balance_side || 'debit').toLowerCase();
  const isNormal   = (entryType === 'Debit' && normalSide === 'debit') ||
                     (entryType === 'Credit' && normalSide === 'credit');
  const delta      = isNormal ? amount : -amount;

  await Accounts.findOneAndUpdate(
    { Account_uuid: accountUuid },
    { $inc: { Balance: delta }, $set: { Updated_at: new Date() } }
  );
}

/**
 * Bulk-update balances for all lines in a journal entry.
 *
 * @param {Array<{Account_id: string, Type: string, Amount: number}>} journalLines
 */
async function updateBalancesForJournal(journalLines = []) {
  await Promise.all(
    journalLines.map((line) => updateBalance(line.Account_id, line.Type, line.Amount))
  );
}

module.exports = {
  getUuid,
  getName,
  resolve,
  isUuid,
  initialize,
  invalidateCache,
  updateBalance,
  updateBalancesForJournal,
  SYSTEM_ACCOUNT_META,
};
