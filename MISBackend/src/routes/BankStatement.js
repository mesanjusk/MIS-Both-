const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { v4: uuid } = require('uuid');
const BankStatement = require('../repositories/bankStatement');
const DiaryDraft = require('../repositories/diaryDraft');
const logger = require('../utils/logger');

router.use(requireAuth);

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

// POST /api/bank-statement/upload-csv
router.post('/upload-csv', async (req, res) => {
  try {
    const { csv_text, uploaded_by } = req.body;
    if (!csv_text || !uploaded_by) {
      return res.status(400).json({ success: false, message: 'csv_text and uploaded_by are required' });
    }

    const { entries, error, accountName } = parseSbiCsv(csv_text);
    if (error) return res.status(400).json({ success: false, message: error });
    if (!entries.length) return res.status(400).json({ success: false, message: 'No valid entries found in CSV' });

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

// PUT /api/bank-statement/:uuid/entry/:entryUuid  — manual match / unmatch
router.put('/:uuid/entry/:entryUuid', async (req, res) => {
  try {
    const { match_status, matched_diary_uuid, matched_diary_entry_uuid, matched_party } = req.body;
    const setFields = {};
    if (match_status              !== undefined) setFields['entries.$[e].match_status']              = match_status;
    if (matched_diary_uuid        !== undefined) setFields['entries.$[e].matched_diary_uuid']        = matched_diary_uuid;
    if (matched_diary_entry_uuid  !== undefined) setFields['entries.$[e].matched_diary_entry_uuid']  = matched_diary_entry_uuid;
    if (matched_party             !== undefined) setFields['entries.$[e].matched_party']             = matched_party;
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
