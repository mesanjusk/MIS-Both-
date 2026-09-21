const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { v4: uuid } = require('uuid');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const BankStatement = require('../repositories/bankStatement');
const DiaryDraft = require('../repositories/diaryDraft');
const Transaction = require('../repositories/transaction');
const Customer = require('../repositories/customer');
const logger = require('../utils/logger');
const { resolve: resolveAccount } = require('../services/accountRegistry');
const {
  SYSTEM_ACCOUNTS,
  BUSINESS_SOURCES,
  upsertBalancedTransaction,
  reverseAndDeleteTransaction,
} = require('../services/accountingPostingService');
const { parseAmount } = require('../utils/money');

router.use(requireAuth);

// Multer: memory storage, PDF only, max 10 MB
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  },
});

// --------------- helpers ---------------

const toAmt = parseAmount;

// Parse DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
function parseDateStr(str) {
  if (!str) return null;
  const s = str.trim();
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d;
  }
  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const d = new Date(`${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Normalise CSV header: trim, lowercase, collapse separators → underscore.
// A header with a trailing separator (e.g. "Ref No./Cheque No.") would
// otherwise collapse to "ref_no_cheque_no_" with a stray trailing
// underscore, silently breaking the row['ref_no_cheque_no'] lookup below
// for exactly the column name this parser documents as the expected format.
const normHeader = (h) => h.trim().toLowerCase().replace(/[\s\/\.\-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');

// Parse SBI bank statement CSV
// Expected columns (in order): Txn Date, Value Date, Description, Ref No./Cheque No., Branch Code, Debit, Credit, Balance
function parseSbiCsv(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);

  // Find the header row (contains "txn" or "date" and "debit" and "credit")
  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const lower = lines[i].toLowerCase();
    if ((lower.includes('txn') || lower.includes('date')) && lower.includes('debit') && lower.includes('credit')) {
      headers = lines[i].split(',').map(normHeader);
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { entries: [], error: 'Header row not found. Expected columns: Txn Date, Debit, Credit, Balance.' };
  }

  // Extract account name from lines before header (SBI puts it there)
  let accountName = '';
  for (let i = 0; i < headerIdx; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    const lower = lines[i].toLowerCase();
    if (lower.includes('account name') || lower.includes('acc name')) {
      accountName = parts[1] || parts[0] || '';
      break;
    }
    if (lower.includes('sbi') || lower.includes('state bank') || parts[1]) {
      accountName = accountName || parts[1] || '';
    }
  }

  const entries = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    if (vals.length < 4) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });

    // Accept various header name forms
    const txnDateStr  = row['txn_date'] || row['date'] || row['transaction_date'] || '';
    const valDateStr  = row['value_date'] || row['val_date'] || txnDateStr;
    const description = row['description'] || row['narration'] || row['particulars'] || '';
    const refNo       = row['ref_no_cheque_no'] || row['ref_no'] || row['cheque_no'] || row['reference'] || '';
    const debit       = toAmt(row['debit'] || row['withdrawal'] || '0');
    const credit      = toAmt(row['credit'] || row['deposit'] || '0');
    const balance     = toAmt(row['balance'] || '0');

    if (!txnDateStr) continue;
    const txnDate = parseDateStr(txnDateStr);
    if (!txnDate) continue;
    if (!debit && !credit) continue;

    entries.push({
      entry_uuid:   uuid(),
      txn_date:     txnDate,
      value_date:   parseDateStr(valDateStr) || txnDate,
      description,
      ref_no:       refNo,
      debit,
      credit,
      balance,
      direction:    credit > 0 ? 'in' : 'out',
      match_status: 'unmatched',
    });
  }

  return { entries, error: null, accountName };
}

// Parse raw text extracted from SBI PDF bank statement.
// Handles both single-line-per-transaction and multi-line (one column per line) layouts.
function parseSbiPdfText(text) {
  const AMT_RE   = /([\d,]+\.\d{2})/g;
  const DATE_PAT = /\d{2}[\/\-]\d{2}[\/\-]\d{4}/g;

  let accountName = '';
  // Grab account name from header area
  const nameMatch = text.match(/(?:account\s*(?:name|holder)\s*[:\-]?\s*)([A-Z][A-Z\s]+)/i);
  if (nameMatch) accountName = nameMatch[1].trim();

  const entries = [];

  // ── Strategy 1: single-line rows (each txn on one line) ──────────────────
  // Matches lines that contain at least one DD/MM/YYYY date and at least 2 amounts
  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of rawLines) {
    const dates = line.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/g);
    if (!dates) continue;

    // Date must appear within the first 25 chars
    const firstDateIdx = line.indexOf(dates[0]);
    if (firstDateIdx > 25) continue;

    const txnDate   = parseDateStr(dates[0]);
    if (!txnDate) continue;
    const valueDate = dates[1] ? parseDateStr(dates[1]) : txnDate;

    // Strip dates, collect amounts
    let rest = line;
    for (const d of dates) rest = rest.replace(d, '');

    const allAmts = [];
    let m;
    const re = /([\d,]+\.\d{2})/g;
    while ((m = re.exec(rest)) !== null) allAmts.push(toAmt(m[1]));

    if (allAmts.length < 2) continue;

    const balance = allAmts[allAmts.length - 1];
    let debit = 0, credit = 0;
    if (allAmts.length >= 3) {
      debit  = allAmts[allAmts.length - 3];
      credit = allAmts[allAmts.length - 2];
    } else {
      credit = allAmts[0];
    }
    if (!debit && !credit) continue;

    const desc = rest.replace(/([\d,]+\.\d{2})/g, '').replace(/\s+/g, ' ').trim();

    entries.push({
      entry_uuid:   uuid(),
      txn_date:     txnDate,
      value_date:   valueDate || txnDate,
      description:  desc,
      ref_no:       '',
      debit,
      credit,
      balance,
      direction:    credit > 0 ? 'in' : 'out',
      match_status: 'unmatched',
    });
  }

  if (entries.length) return { entries, accountName, error: null };

  // ── Strategy 2: multi-line / column-per-line layout ───────────────────────
  // Some PDFs have each column on its own line. Collect all dates in the text
  // and pair them with the surrounding numbers.
  const allDateMatches = [...text.matchAll(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/g)];
  const allAmtMatches  = [...text.matchAll(/([\d,]+\.\d{2})/g)];

  for (let di = 0; di < allDateMatches.length; di++) {
    const txnDate = parseDateStr(allDateMatches[di][0]);
    if (!txnDate) continue;

    // Look for a second date (value date) close by in the text
    const dtPos = allDateMatches[di].index;
    let valueDate = txnDate;
    if (di + 1 < allDateMatches.length && allDateMatches[di + 1].index - dtPos < 30) {
      valueDate = parseDateStr(allDateMatches[di + 1][0]) || txnDate;
      di++; // skip value date
    }

    // Find the 3 amounts that come immediately after this date in the text
    const nearAmts = allAmtMatches
      .filter((a) => a.index > dtPos && a.index < dtPos + 300)
      .map((a) => toAmt(a[1]));

    if (nearAmts.length < 2) continue;

    const balance = nearAmts[nearAmts.length - 1];
    let debit = 0, credit = 0;
    if (nearAmts.length >= 3) {
      debit  = nearAmts[nearAmts.length - 3];
      credit = nearAmts[nearAmts.length - 2];
    } else {
      credit = nearAmts[0];
    }
    if (!debit && !credit) continue;

    // Grab the text between the date position and the first amount position
    const firstAmtPos = allAmtMatches.find((a) => a.index > dtPos)?.index || dtPos;
    const desc = text.substring(dtPos + 10, firstAmtPos).replace(/\s+/g, ' ').trim();

    entries.push({
      entry_uuid:   uuid(),
      txn_date:     txnDate,
      value_date:   valueDate,
      description:  desc,
      ref_no:       '',
      debit,
      credit,
      balance,
      direction:    credit > 0 ? 'in' : 'out',
      match_status: 'unmatched',
    });
  }

  const error = entries.length ? null : 'No transactions found in PDF. Make sure it is an SBI bank statement.';
  return { entries, accountName, error };
}

// Parse SBI bank statement in fixed-width notepad/text format.
// Dates: "D Mon YYYY" or "DD Mon YYYY".  Direction: prefix "TO" = debit/out, "BY"/"INB" = credit/in.
function parseSbiTextFormat(text) {
  const MONTH_MAP = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

  function parseSbiDate(str) {
    if (!str) return null;
    const m = str.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (!m) return null;
    const month = MONTH_MAP[m[2].toLowerCase()];
    if (month === undefined) return null;
    return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  }

  let accountName = '';
  const nameMatch = text.match(/account\s*(?:name|holder)?\s*[:\-]?\s*([A-Z][A-Z\s]{3,})/i);
  if (nameMatch) accountName = nameMatch[1].trim();

  const entries = [];
  for (const line of text.split('\n')) {
    const lineStr = line.trim();
    if (!lineStr) continue;

    const dateParts = [...lineStr.matchAll(/\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b/g)];
    if (!dateParts.length) continue;

    const txnDate = parseSbiDate(dateParts[0][1]);
    if (!txnDate) continue;
    const valueDate = dateParts[1] ? (parseSbiDate(dateParts[1][1]) || txnDate) : txnDate;

    const amounts = [...lineStr.matchAll(/([\d,]+\.\d{2})/g)];
    if (amounts.length < 2) continue;

    const balance = toAmt(amounts[amounts.length - 1][1]);
    const credit  = toAmt(amounts[amounts.length - 2][1]);
    const debit   = amounts.length >= 3 ? toAmt(amounts[amounts.length - 3][1]) : 0;
    if (!debit && !credit) continue;

    // Description: text between last date-match end and first-of-the-last-2/3-amounts start
    const lastDate    = dateParts[dateParts.length - 1];
    const lastDateEnd = lastDate.index + lastDate[0].length;
    const amtOffset   = amounts.length >= 3 ? amounts.length - 3 : amounts.length - 2;
    const firstAmtIdx = amounts[amtOffset].index;
    let desc = lineStr.substring(lastDateEnd, firstAmtIdx).replace(/\s+/g, ' ').trim();
    // Strip trailing standalone ref number (6+ digits)
    desc = desc.replace(/\s+\d{6,}\s*$/, '').trim();

    const descUpper = desc.toUpperCase();
    let direction;
    if (/^(TO |BY DEBIT|DEBIT)/.test(descUpper)) direction = 'out';
    else if (/^(BY |INB |CREDIT|NEFT CR|IMPS CR)/.test(descUpper)) direction = 'in';
    else direction = credit > 0 ? 'in' : 'out';

    entries.push({
      entry_uuid:   uuid(),
      txn_date:     txnDate,
      value_date:   valueDate,
      description:  desc,
      ref_no:       '',
      debit,
      credit,
      balance,
      direction,
      match_status: 'unmatched',
    });
  }

  const error = entries.length ? null : 'No transactions found in text format.';
  return { entries, accountName, error };
}

// Auto-match bank statement entries against diary bank entries
async function autoMatchEntries(stmtEntries) {
  if (!stmtEntries.length) return stmtEntries;

  // Load all diary pages that have bank entries
  const diaries = await DiaryDraft.find(
    { 'entries.book': 'bank' },
    { diary_uuid: 1, diary_date: 1, entries: 1 }
  ).lean();

  for (const stmtEntry of stmtEntries) {
    const stmtAmt = stmtEntry.credit > 0 ? stmtEntry.credit : stmtEntry.debit;
    if (!stmtAmt) continue;

    let bestScore = 0;
    let bestDiaryUuid = null;
    let bestEntryUuid = null;
    let bestParty = '';

    for (const diary of diaries) {
      const bankEntries = (diary.entries || []).filter(
        (e) => e.book === 'bank' && e.entry_status !== 'rejected'
      );

      for (const dEntry of bankEntries) {
        // Amount must match exactly
        if (dEntry.amount !== stmtAmt) continue;

        // Direction must match (diary 'in' ↔ statement credit; diary 'out' ↔ statement debit)
        if (dEntry.direction !== stmtEntry.direction) continue;

        // Date proximity (within 7 days)
        const daysDiff = Math.abs(
          (new Date(stmtEntry.txn_date) - new Date(diary.diary_date)) / 86400000
        );
        if (daysDiff > 7) continue;

        let score = 50; // amount exact match
        if (daysDiff === 0) score += 30;
        else if (daysDiff === 1) score += 20;
        else if (daysDiff <= 3) score += 10;
        else score += 3;

        // Party name appears in description (word-level match)
        const descLower = stmtEntry.description.toLowerCase();
        const partyWords = dEntry.party.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        if (partyWords.some((w) => descLower.includes(w))) score += 20;

        if (score > bestScore) {
          bestScore = score;
          bestDiaryUuid = diary.diary_uuid;
          bestEntryUuid = dEntry.entry_uuid;
          bestParty = dEntry.party;
        }
      }
    }

    if (bestScore >= 70) {
      stmtEntry.match_status             = 'matched';
      stmtEntry.match_score              = bestScore;
      stmtEntry.matched_diary_uuid       = bestDiaryUuid;
      stmtEntry.matched_diary_entry_uuid = bestEntryUuid;
      stmtEntry.matched_party            = bestParty;
    }
  }

  return stmtEntries;
}

// --------------- bank-ledger reconciliation helpers ---------------

const normalizeLedgerName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const BANK_NAME_NOISE = new Set([
  'upi', 'bank', 'account', 'acct', 'a/c', 'current', 'saving', 'savings',
  'sbi', 'state', 'india', 'branch', 'business', 'digital'
]);

const meaningfulBankTokens = (value) => normalizeLedgerName(value)
  .split(' ')
  .filter((token) => token && token.length > 1 && !BANK_NAME_NOISE.has(token));

function scoreBankLedgerName(statementAccountName, ledgerName) {
  const target = normalizeLedgerName(statementAccountName);
  const candidate = normalizeLedgerName(ledgerName);
  if (!target || !candidate) return 0;
  if (target === candidate) return 100;
  if (target.includes(candidate) || candidate.includes(target)) return 90;

  const targetTokens = meaningfulBankTokens(target);
  const candidateTokens = meaningfulBankTokens(candidate);
  if (!targetTokens.length || !candidateTokens.length) return 0;

  const candidateSet = new Set(candidateTokens);
  const overlap = targetTokens.filter((token) => candidateSet.has(token)).length;
  if (!overlap) return 0;

  const targetCoverage = overlap / targetTokens.length;
  const candidateCoverage = overlap / candidateTokens.length;

  // Full coverage of the shorter real name is a strong signal. This handles
  // statement names like "SANJU SK" vs ledger names like "UPI Sanju Sk".
  if (targetCoverage === 1 || candidateCoverage === 1) return 80 + overlap;
  if (overlap >= 2 && targetCoverage >= 0.6 && candidateCoverage >= 0.6) return 70 + overlap;
  return overlap * 10;
}

function chooseBankLedgerDoc(statementAccountName, docs = [], { allowFallback = true } = {}) {
  const bankDocs = (docs || []).filter(
    (doc) => doc?.Customer_uuid && doc?.Customer_name && !/cash/i.test(doc.Customer_name)
  );
  if (!bankDocs.length) return null;

  const ranked = bankDocs
    .map((doc) => ({ doc, score: scoreBankLedgerName(statementAccountName, doc.Customer_name) }))
    .sort((a, b) => b.score - a.score);

  if (ranked[0]?.score >= 70) return ranked[0].doc;
  return allowFallback ? bankDocs[0] : null;
}

async function resolveStatementBankLedger(stmt) {
  const docs = await Customer.find(
    { Customer_group: 'Bank and Account' },
    { Customer_name: 1, Customer_uuid: 1 }
  ).lean();

  // Explicit user selection is authoritative.
  if (stmt?.ledger_account_locked && stmt?.ledger_account_uuid) {
    const locked = docs.find(
      (doc) => String(doc.Customer_uuid) === String(stmt.ledger_account_uuid)
    );
    if (locked) {
      stmt.ledger_account_name = locked.Customer_name;
      return { uuid: locked.Customer_uuid, name: locked.Customer_name };
    }
  }

  // For auto mappings, always retry confident name matching. This repairs
  // statements that were previously persisted to the first bank ledger merely
  // because the parser account name did not exactly equal the MIS ledger name.
  const confident = chooseBankLedgerDoc(stmt?.account_name, docs, { allowFallback: false });
  if (confident) {
    stmt.ledger_account_uuid = confident.Customer_uuid;
    stmt.ledger_account_name = confident.Customer_name;
    return { uuid: confident.Customer_uuid, name: confident.Customer_name };
  }

  // If an earlier auto mapping exists and still resolves, keep it rather than
  // switching accounts again without evidence.
  if (stmt?.ledger_account_uuid) {
    const existing = docs.find(
      (doc) => String(doc.Customer_uuid) === String(stmt.ledger_account_uuid)
    );
    if (existing) {
      stmt.ledger_account_name = existing.Customer_name;
      return { uuid: existing.Customer_uuid, name: existing.Customer_name };
    }
  }

  const chosen = chooseBankLedgerDoc(stmt?.account_name, docs, { allowFallback: true });
  if (chosen) {
    stmt.ledger_account_uuid = chosen.Customer_uuid;
    stmt.ledger_account_name = chosen.Customer_name;
    return { uuid: chosen.Customer_uuid, name: chosen.Customer_name };
  }

  // Safe fallback for installations that have not configured a dedicated bank
  // ledger customer yet.
  const fallback = await resolveAccount(SYSTEM_ACCOUNTS.BANK);
  stmt.ledger_account_uuid = fallback.uuid;
  stmt.ledger_account_name = fallback.name;
  return fallback;
}

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

function lineMatchesAccount(line, identifiers = []) {
  const candidates = identifiers
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  const id = String(line?.Account_id || '').trim().toLowerCase();
  const name = String(line?.Account_name || '').trim().toLowerCase();
  return candidates.includes(id) || candidates.includes(name);
}

function transactionMatchesBankEntry(transaction, entry, bankLedger, assignedAcct) {
  if (!transaction || !entry || !bankLedger || !assignedAcct) return false;

  const source = String(transaction.Source || '');
  if (source === BUSINESS_SOURCES.BANK_STATEMENT ||
      source.startsWith(`${BUSINESS_SOURCES.BANK_STATEMENT}:`)) {
    return false;
  }

  const amount = roundMoney(entry.credit > 0 ? entry.credit : entry.debit);
  if (!(amount > 0)) return false;

  const bankType = entry.direction === 'in' ? 'Debit' : 'Credit';
  const counterType = entry.direction === 'in' ? 'Credit' : 'Debit';
  const bankIds = [bankLedger.uuid, bankLedger.name];
  const counterIds = [assignedAcct.uuid, assignedAcct.name, entry.account_assigned];

  const lines = Array.isArray(transaction.Journal_entry) ? transaction.Journal_entry : [];
  const bankLeg = lines.some((line) =>
    lineMatchesAccount(line, bankIds) &&
    String(line?.Type || '') === bankType &&
    roundMoney(line?.Amount) === amount
  );
  const counterLeg = lines.some((line) =>
    lineMatchesAccount(line, counterIds) &&
    String(line?.Type || '') === counterType &&
    roundMoney(line?.Amount) === amount
  );

  return bankLeg && counterLeg;
}

async function findExistingLedgerTransaction({ entry, bankLedger, assignedAcct, excludeTransactionUuid }) {
  const txnDate = entry?.txn_date ? new Date(entry.txn_date) : null;
  if (!txnDate || Number.isNaN(txnDate.getTime())) {
    return { transaction: null, ambiguous: false, matches: [] };
  }

  const dayStart = new Date(txnDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const dayTransactions = await Transaction.find({
    Transaction_date: { $gte: dayStart, $lt: dayEnd },
  }).sort({ Transaction_id: 1 }).lean();

  let matches = dayTransactions.filter((txn) =>
    String(txn.Transaction_uuid || '') !== String(excludeTransactionUuid || '') &&
    transactionMatchesBankEntry(txn, entry, bankLedger, assignedAcct)
  );

  if (matches.length > 1 && entry.ref_no) {
    const ref = String(entry.ref_no).replace(/\s+/g, '').toLowerCase();
    const refMatches = matches.filter(
      (txn) => String(txn.Upi_reference || '').replace(/\s+/g, '').toLowerCase() === ref
    );
    if (refMatches.length === 1) matches = refMatches;
  }

  return {
    transaction: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
    matches,
  };
}

function diaryLinkFromSource(source) {
  const match = String(source || '').match(/^diary:([^:]+):([^:]+)$/);
  return match ? { diaryUuid: match[1], entryUuid: match[2] } : null;
}

async function ensureBankEntryInLedger({ stmt, entry, actor }) {
  if (!entry?.account_assigned) {
    return { mode: 'skipped', reason: 'missing_account' };
  }

  const amount = roundMoney(entry.credit > 0 ? entry.credit : entry.debit);
  if (!(amount > 0)) {
    return { mode: 'skipped', reason: 'invalid_amount' };
  }

  const [bankLedger, assignedAcct] = await Promise.all([
    resolveStatementBankLedger(stmt),
    resolveAccount(entry.account_assigned),
  ]);

  if (assignedAcct.name === assignedAcct.uuid) {
    throw Object.assign(
      new Error(`Assigned account '${entry.account_assigned}' could not be resolved. Check Accounts/Customers.`),
      { statusCode: 400 }
    );
  }

  const currentTxn = entry.transaction_uuid
    ? await Transaction.findOne({ Transaction_uuid: entry.transaction_uuid }).lean()
    : null;
  const currentSource = String(currentTxn?.Source || '');
  const currentIsBankOwned =
    currentSource === BUSINESS_SOURCES.BANK_STATEMENT ||
    currentSource.startsWith(`${BUSINESS_SOURCES.BANK_STATEMENT}:`);

  // If this statement row already points at a real Diary/manual transaction,
  // trust that link. It is the same real-world payment, so do not post it twice.
  if (currentTxn && !currentIsBankOwned) {
    return { mode: 'linked', transaction: currentTxn, existing: true };
  }

  // Before creating or moving a bank-statement-owned posting, look for the
  // same date + amount + direction + counter-account in the actual bank ledger.
  // This catches rows that already exist from Diary/manual entry and prevents
  // the duplicate hidden posting that caused the reported mismatch.
  const candidate = await findExistingLedgerTransaction({
    entry,
    bankLedger,
    assignedAcct,
    excludeTransactionUuid: currentTxn?.Transaction_uuid,
  });

  if (candidate.transaction) {
    if (currentTxn && currentIsBankOwned) {
      await reverseAndDeleteTransaction({ Transaction_uuid: currentTxn.Transaction_uuid });
    }

    entry.entry_status = 'confirmed';
    entry.transaction_uuid = candidate.transaction.Transaction_uuid;
    entry.match_status = 'manual';
    entry.matched_party = entry.account_assigned;

    const diaryLink = diaryLinkFromSource(candidate.transaction.Source);
    if (diaryLink) {
      entry.matched_diary_uuid = diaryLink.diaryUuid;
      entry.matched_diary_entry_uuid = diaryLink.entryUuid;
    }

    return { mode: 'linked', transaction: candidate.transaction, existing: true };
  }

  if (candidate.ambiguous) {
    return {
      mode: 'ambiguous',
      matches: candidate.matches.map((txn) => ({
        Transaction_uuid: txn.Transaction_uuid,
        Transaction_id: txn.Transaction_id,
      })),
    };
  }

  const source = `${BUSINESS_SOURCES.BANK_STATEMENT}:${stmt.statement_uuid}:${entry.entry_uuid}`;
  const common = {
    amount,
    paymentMode: 'Bank',
    description: entry.description || entry.account_assigned,
    transactionDate: entry.txn_date || new Date(),
    createdBy: actor || 'bank_statement',
    source,
    reference: entry.ref_no || '',
  };

  const posting = entry.direction === 'in'
    ? await upsertBalancedTransaction({
        ...common,
        debitAccount: bankLedger.uuid,
        creditAccount: assignedAcct.uuid,
      })
    : await upsertBalancedTransaction({
        ...common,
        debitAccount: assignedAcct.uuid,
        creditAccount: bankLedger.uuid,
      });

  entry.entry_status = 'confirmed';
  entry.transaction_uuid = posting.transaction.Transaction_uuid;
  return { mode: currentTxn ? 'reposted' : 'created', transaction: posting.transaction, existing: posting.existing };
}

// --------------- routes ---------------

// POST /api/bank-statement/upload-pdf
router.post('/upload-pdf', pdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'PDF file is required (field name: pdf)' });
    }
    const uploaded_by = req.body.uploaded_by || req.query.uploaded_by || 'user';

    let pdfData;
    try {
      pdfData = await pdfParse(req.file.buffer);
    } catch (parseErr) {
      logger.error({ parseErr }, 'pdf-parse failed');
      return res.status(422).json({ success: false, message: 'Could not read PDF. Make sure it is not password-protected.' });
    }

    let parsed = parseSbiPdfText(pdfData.text);
    // Fallback to fixed-width text format (works when PDF text looks like notepad export)
    if (parsed.error || !parsed.entries.length) {
      const fallback = parseSbiTextFormat(pdfData.text);
      if (!fallback.error) parsed = fallback;
    }
    const { entries, error, accountName } = parsed;
    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
        debug_text_preview: pdfData.text.substring(0, 3000),
      });
    }

    const enriched = await autoMatchEntries(entries);

    const dates = enriched.map((e) => e.txn_date).sort((a, b) => a - b);
    const statement = new BankStatement({
      statement_uuid: uuid(),
      account_name:   accountName || 'SBI Bank Account',
      uploaded_by,
      period_start:   dates[0],
      period_end:     dates[dates.length - 1],
      entries:        enriched,
    });
    await statement.save();

    return res.status(201).json({ success: true, message: 'PDF bank statement uploaded', result: statement });
  } catch (err) {
    logger.error({ err }, 'POST /bank-statement/upload-pdf');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/bank-statement/upload-csv
router.post('/upload-csv', async (req, res) => {
  try {
    const { csv_text, uploaded_by } = req.body;
    if (!csv_text || !uploaded_by) {
      return res.status(400).json({ success: false, message: 'csv_text and uploaded_by are required' });
    }

    let parsed = parseSbiCsv(csv_text);
    // Fallback to fixed-width text/notepad format
    if (parsed.error || !parsed.entries.length) {
      parsed = parseSbiTextFormat(csv_text);
    }
    const { entries, error, accountName } = parsed;
    if (error) return res.status(400).json({ success: false, message: error });
    if (!entries.length) return res.status(400).json({ success: false, message: 'No valid entries found' });

    const enriched = await autoMatchEntries(entries);

    const dates = enriched.map((e) => e.txn_date).sort((a, b) => a - b);
    const statement = new BankStatement({
      statement_uuid: uuid(),
      account_name:   accountName || 'Bank Account',
      uploaded_by,
      period_start:   dates[0],
      period_end:     dates[dates.length - 1],
      entries:        enriched,
    });
    await statement.save();

    return res.status(201).json({ success: true, message: 'Bank statement uploaded', result: statement });
  } catch (err) {
    logger.error({ err }, 'POST /bank-statement/upload-csv');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/bank-statement  — list all, newest first
router.get('/', async (req, res) => {
  try {
    const list = await BankStatement.find({}, { entries: 0 }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, result: list });
  } catch (err) {
    logger.error({ err }, 'GET /bank-statement');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/bank-statement/ledger-accounts
// Bank/customer ledgers that can represent an imported statement.
router.get('/ledger-accounts', async (_req, res) => {
  try {
    const docs = await Customer.find(
      { Customer_group: 'Bank and Account' },
      { Customer_name: 1, Customer_uuid: 1 }
    ).sort({ Customer_name: 1 }).lean();

    const result = docs
      .filter((doc) => doc?.Customer_uuid && doc?.Customer_name && !/cash/i.test(doc.Customer_name))
      .map((doc) => ({ uuid: doc.Customer_uuid, name: doc.Customer_name }));

    return res.json({ success: true, result });
  } catch (err) {
    logger.error({ err }, 'GET /bank-statement/ledger-accounts');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/bank-statement/:uuid/ledger-account
// Explicitly choose the bank ledger for a statement and immediately repair all
// confirmed rows so the visible ledger reflects reconciliation.
router.put('/:uuid/ledger-account', async (req, res) => {
  try {
    const { ledger_account_uuid } = req.body || {};
    if (!ledger_account_uuid) {
      return res.status(400).json({ success: false, message: 'ledger_account_uuid is required' });
    }

    const bankDoc = await Customer.findOne({
      Customer_uuid: ledger_account_uuid,
      Customer_group: 'Bank and Account',
    }, { Customer_name: 1, Customer_uuid: 1 }).lean();

    if (!bankDoc || !bankDoc.Customer_name || /cash/i.test(bankDoc.Customer_name)) {
      return res.status(400).json({ success: false, message: 'Select a valid non-cash Bank and Account ledger' });
    }

    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid });
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });

    stmt.ledger_account_uuid = bankDoc.Customer_uuid;
    stmt.ledger_account_name = bankDoc.Customer_name;
    stmt.ledger_account_locked = true;

    const stats = { linked: 0, created: 0, reposted: 0, ambiguous: 0, skipped: 0 };
    for (const entry of stmt.entries || []) {
      if (entry.entry_status !== 'confirmed') continue;

      const result = await ensureBankEntryInLedger({
        stmt,
        entry,
        actor: req.user?.userName || 'bank_statement_mapping',
      });

      if (Object.prototype.hasOwnProperty.call(stats, result.mode)) stats[result.mode] += 1;
      else stats.skipped += 1;
    }

    await stmt.save();
    return res.json({
      success: true,
      message: `Bank ledger set to ${bankDoc.Customer_name} and confirmed rows synchronized`,
      result: stmt,
      sync: stats,
    });
  } catch (err) {
    logger.error({ err }, 'PUT /bank-statement/:uuid/ledger-account');
    return res.status(err?.statusCode || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

// GET /api/bank-statement/by-date?date=YYYY-MM-DD
// Returns unmatched, non-confirmed bank statement entries for a given date
router.get('/by-date', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date query param required (YYYY-MM-DD)' });

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd   = new Date(`${date}T23:59:59.999Z`);

    const statements = await BankStatement.find({
      'entries.txn_date': { $gte: dayStart, $lte: dayEnd },
    }).lean();

    const entries = [];
    for (const stmt of statements) {
      for (const entry of stmt.entries || []) {
        const d = new Date(entry.txn_date);
        if (d < dayStart || d > dayEnd) continue;
        if (entry.match_status === 'matched') continue;      // already has a diary entry
        if (entry.entry_status === 'confirmed') continue;    // already confirmed
        entries.push({
          ...entry,
          statement_uuid: stmt.statement_uuid,
          account_name:   stmt.account_name,
        });
      }
    }

    return res.json({ success: true, result: entries });
  } catch (err) {
    logger.error({ err }, 'GET /bank-statement/by-date');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/bank-statement/:uuid
router.get('/:uuid', async (req, res) => {
  try {
    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid }).lean();
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });
    return res.json({ success: true, result: stmt });
  } catch (err) {
    logger.error({ err }, 'GET /bank-statement/:uuid');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/bank-statement/:uuid/entry/:entryUuid  — update match or account assignment
router.put('/:uuid/entry/:entryUuid', async (req, res) => {
  try {
    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid });
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });

    const entry = (stmt.entries || []).find((e) => e.entry_uuid === req.params.entryUuid);
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });

    const {
      match_status, matched_diary_uuid, matched_diary_entry_uuid, matched_party,
      account_assigned, entry_status,
    } = req.body;

    if (entry_status === 'confirmed' && entry.entry_status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Use the confirm action so a ledger transaction is created before marking this row confirmed',
      });
    }

    const setFields = {};
    if (match_status             !== undefined) setFields['entries.$[e].match_status']             = match_status;
    if (matched_diary_uuid       !== undefined) setFields['entries.$[e].matched_diary_uuid']       = matched_diary_uuid;
    if (matched_diary_entry_uuid !== undefined) setFields['entries.$[e].matched_diary_entry_uuid'] = matched_diary_entry_uuid;
    if (matched_party            !== undefined) setFields['entries.$[e].matched_party']            = matched_party;
    if (account_assigned         !== undefined) setFields['entries.$[e].account_assigned']         = account_assigned;
    if (entry_status             !== undefined) setFields['entries.$[e].entry_status']             = entry_status;
    if (match_status === 'manual') setFields['entries.$[e].match_status'] = 'manual';

    if (entry.entry_status === 'confirmed' && entry.transaction_uuid) {
      const linkedTxn = await Transaction.findOne({ Transaction_uuid: entry.transaction_uuid });
      const linkedSource = String(linkedTxn?.Source || '');
      const isBankOwned =
        linkedSource === BUSINESS_SOURCES.BANK_STATEMENT ||
        linkedSource.startsWith(`${BUSINESS_SOURCES.BANK_STATEMENT}:`);

      if (entry_status !== undefined && entry_status !== 'confirmed') {
        if (isBankOwned) {
          await reverseAndDeleteTransaction({ Transaction_uuid: entry.transaction_uuid });
        }
        setFields['entries.$[e].transaction_uuid'] = null;
      } else if (account_assigned !== undefined && String(account_assigned) !== String(entry.account_assigned || '')) {
        if (!isBankOwned) {
          return res.status(409).json({
            success: false,
            message: 'This bank row reuses a confirmed Diary transaction. Change/reopen the Diary entry instead.',
          });
        }

        const amount = Number(entry.credit > 0 ? entry.credit : entry.debit);
        const source = `${BUSINESS_SOURCES.BANK_STATEMENT}:${stmt.statement_uuid}:${entry.entry_uuid}`;
        const bankLedger = await resolveStatementBankLedger(stmt);
        const posting = entry.direction === 'in'
          ? await upsertBalancedTransaction({
              amount,
              debitAccount: bankLedger.uuid,
              creditAccount: account_assigned,
              paymentMode: 'Bank',
              description: entry.description || account_assigned,
              transactionDate: entry.txn_date || new Date(),
              createdBy: req.user?.userName || 'bank_statement',
              source,
              reference: entry.ref_no || '',
            })
          : await upsertBalancedTransaction({
              amount,
              debitAccount: account_assigned,
              creditAccount: bankLedger.uuid,
              paymentMode: 'Bank',
              description: entry.description || account_assigned,
              transactionDate: entry.txn_date || new Date(),
              createdBy: req.user?.userName || 'bank_statement',
              source,
              reference: entry.ref_no || '',
            });
        setFields['entries.$[e].transaction_uuid'] = posting.transaction.Transaction_uuid;
      }
    }

    await BankStatement.updateOne(
      { statement_uuid: req.params.uuid },
      { $set: setFields },
      { arrayFilters: [{ 'e.entry_uuid': req.params.entryUuid }] }
    );

    const updated = await BankStatement.findOne({ statement_uuid: req.params.uuid }).lean();
    return res.json({ success: true, result: updated });
  } catch (err) {
    logger.error({ err }, 'PUT /bank-statement/:uuid/entry/:entryUuid');
    return res.status(err?.statusCode || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

// POST /api/bank-statement/:uuid/entry/:entryUuid/confirm
router.post('/:uuid/entry/:entryUuid/confirm', async (req, res) => {
  try {
    const { confirmed_by } = req.body;
    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid });
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });

    const entry = (stmt.entries || []).find((e) => e.entry_uuid === req.params.entryUuid);
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });

    // Prefer an already-confirmed Diary transaction when this row was matched to
    // one. This path predates the generic transaction-level reconciliation below
    // and keeps those explicit links authoritative.
    if (entry.matched_diary_uuid && entry.matched_diary_entry_uuid) {
      const diary = await DiaryDraft.findOne({ diary_uuid: entry.matched_diary_uuid }).lean();
      const diaryEntry = (diary?.entries || []).find(
        (e) => String(e.entry_uuid) === String(entry.matched_diary_entry_uuid)
      );
      if (diaryEntry?.transaction_uuid) {
        const diaryTxn = await Transaction.findOne({ Transaction_uuid: diaryEntry.transaction_uuid }).lean();
        if (diaryTxn) {
          // Remove a stale bank-owned duplicate if an older confirmation created
          // one before this Diary link was established.
          if (entry.transaction_uuid && entry.transaction_uuid !== diaryTxn.Transaction_uuid) {
            const oldTxn = await Transaction.findOne({ Transaction_uuid: entry.transaction_uuid }).lean();
            const oldSource = String(oldTxn?.Source || '');
            if (oldSource === BUSINESS_SOURCES.BANK_STATEMENT ||
                oldSource.startsWith(`${BUSINESS_SOURCES.BANK_STATEMENT}:`)) {
              await reverseAndDeleteTransaction({ Transaction_uuid: entry.transaction_uuid });
            }
          }

          entry.entry_status = 'confirmed';
          entry.transaction_uuid = diaryTxn.Transaction_uuid;
          entry.match_status = entry.match_status === 'unmatched' ? 'manual' : entry.match_status;
          await stmt.save();
          return res.json({ success: true, message: 'Linked to matched Diary transaction', result: stmt });
        }
      }
    }

    if (!entry.account_assigned) {
      return res.status(400).json({ success: false, message: 'Assign an account before confirming' });
    }

    const ensured = await ensureBankEntryInLedger({
      stmt,
      entry,
      actor: confirmed_by || req.user?.userName || 'bank_statement',
    });

    if (ensured.mode === 'ambiguous') {
      return res.status(409).json({
        success: false,
        message: 'More than one matching ledger transaction was found. Review this row before confirming to avoid a duplicate.',
        candidates: ensured.matches,
      });
    }
    if (ensured.mode === 'skipped') {
      return res.status(400).json({ success: false, message: 'Bank entry could not be posted to the ledger.' });
    }

    await stmt.save();
    const message = ensured.mode === 'linked'
      ? 'Linked to existing ledger transaction'
      : ensured.mode === 'reposted'
      ? 'Confirmed entry repaired and posted to the bank ledger'
      : 'Transaction created/linked';

    return res.json({ success: true, message, result: stmt });
  } catch (err) {
    logger.error({ err }, 'POST /bank-statement/:uuid/entry/:entryUuid/confirm');
    return res.status(err?.statusCode || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

// POST /api/bank-statement/:uuid/sync-ledger
// Idempotently repairs already-confirmed rows created before bank statements
// were mapped to the real bank ledger. Existing Diary/manual transactions are
// linked instead of duplicated; rows with no existing match are moved/created
// in the configured bank ledger.
router.post('/:uuid/sync-ledger', async (req, res) => {
  try {
    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid });
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });

    const stats = { linked: 0, created: 0, reposted: 0, ambiguous: 0, skipped: 0 };
    for (const entry of stmt.entries || []) {
      if (entry.entry_status !== 'confirmed') continue;

      const result = await ensureBankEntryInLedger({
        stmt,
        entry,
        actor: req.body?.synced_by || req.user?.userName || 'bank_statement_sync',
      });

      if (Object.prototype.hasOwnProperty.call(stats, result.mode)) stats[result.mode] += 1;
      else stats.skipped += 1;
    }

    await stmt.save();
    return res.json({
      success: true,
      message: 'Confirmed bank entries synchronized with the ledger',
      result: stmt,
      sync: stats,
    });
  } catch (err) {
    logger.error({ err }, 'POST /bank-statement/:uuid/sync-ledger');
    return res.status(err?.statusCode || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

// DELETE /api/bank-statement/:uuid
router.delete('/:uuid', async (req, res) => {
  try {
    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid });
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });

    for (const entry of stmt.entries || []) {
      if (!entry.transaction_uuid) continue;
      const txn = await Transaction.findOne({ Transaction_uuid: entry.transaction_uuid }).lean();
      const source = String(txn?.Source || '');
      if (source === BUSINESS_SOURCES.BANK_STATEMENT || source.startsWith(`${BUSINESS_SOURCES.BANK_STATEMENT}:`)) {
        await reverseAndDeleteTransaction({ Transaction_uuid: entry.transaction_uuid });
      }
    }

    await BankStatement.deleteOne({ statement_uuid: req.params.uuid });
    return res.json({ success: true, message: 'Statement deleted; bank-owned postings reversed' });
  } catch (err) {
    logger.error({ err }, 'DELETE /bank-statement/:uuid');
    return res.status(err?.statusCode || 500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

module.exports = router;
// Exposed for unit testing — the parsing/matching logic is otherwise only
// reachable through the multipart upload routes above.
module.exports.toAmt = toAmt;
module.exports.parseDateStr = parseDateStr;
module.exports.normHeader = normHeader;
module.exports.parseSbiCsv = parseSbiCsv;
module.exports.parseSbiPdfText = parseSbiPdfText;
module.exports.parseSbiTextFormat = parseSbiTextFormat;
module.exports.autoMatchEntries = autoMatchEntries;
module.exports.chooseBankLedgerDoc = chooseBankLedgerDoc;
module.exports.scoreBankLedgerName = scoreBankLedgerName;
module.exports.transactionMatchesBankEntry = transactionMatchesBankEntry;
