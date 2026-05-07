const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { v4: uuid } = require('uuid');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const BankStatement = require('../repositories/bankStatement');
const DiaryDraft = require('../repositories/diaryDraft');
const Transaction = require('../repositories/transaction');
const Counter = require('../repositories/counter');
const Customer = require('../repositories/customer');
const logger = require('../utils/logger');

// Return first bank account name from ledger master (Customer_group === 'Bank and Account', name ~sanju)
async function getBankAccountName() {
  const docs = await Customer.find(
    { Customer_group: 'Bank and Account' },
    { Customer_name: 1 }
  ).lean();
  const bankNames = docs.map((d) => d.Customer_name).filter((n) => n && /sanju/i.test(n));
  return bankNames[0] || 'Bank';
}

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

const toAmt = (v) => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

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

// Normalise CSV header: trim, lowercase, collapse spaces → underscore
const normHeader = (h) => h.trim().toLowerCase().replace(/[\s\/\.\-]+/g, '_').replace(/[^a-z0-9_]/g, '');

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
    const {
      match_status, matched_diary_uuid, matched_diary_entry_uuid, matched_party,
      account_assigned, entry_status,
    } = req.body;
    const setFields = {};
    if (match_status             !== undefined) setFields['entries.$[e].match_status']             = match_status;
    if (matched_diary_uuid       !== undefined) setFields['entries.$[e].matched_diary_uuid']       = matched_diary_uuid;
    if (matched_diary_entry_uuid !== undefined) setFields['entries.$[e].matched_diary_entry_uuid'] = matched_diary_entry_uuid;
    if (matched_party            !== undefined) setFields['entries.$[e].matched_party']            = matched_party;
    if (account_assigned         !== undefined) setFields['entries.$[e].account_assigned']         = account_assigned;
    if (entry_status             !== undefined) setFields['entries.$[e].entry_status']             = entry_status;
    if (match_status === 'manual') setFields['entries.$[e].match_status'] = 'manual';

    await BankStatement.updateOne(
      { statement_uuid: req.params.uuid },
      { $set: setFields },
      { arrayFilters: [{ 'e.entry_uuid': req.params.entryUuid }] }
    );

    const updated = await BankStatement.findOne({ statement_uuid: req.params.uuid }).lean();
    return res.json({ success: true, result: updated });
  } catch (err) {
    logger.error({ err }, 'PUT /bank-statement/:uuid/entry/:entryUuid');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/bank-statement/:uuid/entry/:entryUuid/confirm
// Confirms a bank statement entry → creates a double-entry transaction in the ledger
router.post('/:uuid/entry/:entryUuid/confirm', async (req, res) => {
  try {
    const { confirmed_by } = req.body;
    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid });
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });

    const entry = (stmt.entries || []).find((e) => e.entry_uuid === req.params.entryUuid);
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
    if (!entry.account_assigned) {
      return res.status(400).json({ success: false, message: 'Assign an account before confirming' });
    }
    if (entry.entry_status === 'confirmed') {
      return res.status(400).json({ success: false, message: 'Entry is already confirmed' });
    }

    const bankAccount = await getBankAccountName();
    const amount = entry.credit > 0 ? entry.credit : entry.debit;

    const journal = entry.direction === 'in'
      ? [
          { Account_id: bankAccount,           Type: 'Debit',  Amount: amount },
          { Account_id: entry.account_assigned, Type: 'Credit', Amount: amount },
        ]
      : [
          { Account_id: entry.account_assigned, Type: 'Debit',  Amount: amount },
          { Account_id: bankAccount,            Type: 'Credit', Amount: amount },
        ];

    const counter = await Counter.findByIdAndUpdate(
      'transaction_number',
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const txn = new Transaction({
      Transaction_uuid: uuid(),
      Transaction_id:   Number(counter?.seq || 1),
      Transaction_date: entry.txn_date,
      Description:      entry.description || entry.account_assigned,
      Total_Debit:      amount,
      Total_Credit:     amount,
      Payment_mode:     'Bank',
      Created_by:       confirmed_by || 'bank_statement',
      Journal_entry:    journal,
      Source:           'bank_statement',
    });
    await txn.save();

    entry.entry_status    = 'confirmed';
    entry.transaction_uuid = txn.Transaction_uuid;
    await stmt.save();

    return res.json({ success: true, message: 'Transaction created', result: stmt });
  } catch (err) {
    logger.error({ err }, 'POST /bank-statement/:uuid/entry/:entryUuid/confirm');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/bank-statement/:uuid
router.delete('/:uuid', async (req, res) => {
  try {
    const stmt = await BankStatement.findOne({ statement_uuid: req.params.uuid });
    if (!stmt) return res.status(404).json({ success: false, message: 'Statement not found' });
    await BankStatement.deleteOne({ statement_uuid: req.params.uuid });
    return res.json({ success: true, message: 'Statement deleted' });
  } catch (err) {
    logger.error({ err }, 'DELETE /bank-statement/:uuid');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
