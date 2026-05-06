const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { v4: uuid } = require('uuid');
const DiaryDraft = require('../repositories/diaryDraft');
const Transaction = require('../repositories/transaction');
const Counter = require('../repositories/counter');
const logger = require('../utils/logger');

router.use(requireAuth);

// --------------- helpers ---------------

function parseCsv(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  });
}

const toAmt = (v) => {
  const n = Number(String(v || '0').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const PAYMENT_MODE_MAP = { cash: 'Cash', cheque: 'Cheque', upi: 'UPI', neft: 'Bank', bank: 'Bank' };

// --------------- routes ---------------

// POST /api/diary/upload-csv
router.post('/upload-csv', async (req, res) => {
  try {
    const { csv_text, uploaded_by } = req.body;
    if (!csv_text || !uploaded_by) {
      return res.status(400).json({ success: false, message: 'csv_text and uploaded_by are required' });
    }

    const rows = parseCsv(csv_text);
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'No valid rows found in CSV' });
    }

    const dateStr = rows[0]?.date;
    if (!dateStr) {
      return res.status(400).json({ success: false, message: '"date" column missing in CSV' });
    }
    const diaryDate = new Date(dateStr);
    if (isNaN(diaryDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format — use YYYY-MM-DD' });
    }

    let openingBalance = 0;
    let closingBalance = 0;
    const entries = [];

    for (const row of rows) {
      const timeSlot = (row.time || '').toUpperCase();
      const amount = toAmt(row.amount);

      if (timeSlot === 'OB') { openingBalance = amount; continue; }
      if (timeSlot === 'CB') { closingBalance = amount; continue; }
      if (!row.party || !amount) continue;

      entries.push({
        entry_uuid:       uuid(),
        time_slot:        row.time || '',
        party:            row.party,
        amount,
        direction:        (row.direction || 'in').toLowerCase() === 'out' ? 'out' : 'in',
        book:             (row.book || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash',
        mode:             (row.mode || 'cash').toLowerCase(),
        checked:          (row.checked || '').toLowerCase() === 'yes',
        notes:            row.notes || '',
        account_assigned: '',
        entry_status:     'draft',
        transaction_uuid: null,
      });
    }

    if (!entries.length) {
      return res.status(400).json({ success: false, message: 'No valid entries found in CSV' });
    }

    const dayStart = new Date(dateStr + 'T00:00:00.000Z');
    const dayEnd   = new Date(dateStr + 'T23:59:59.999Z');
    const existing = await DiaryDraft.findOne({ diary_date: { $gte: dayStart, $lte: dayEnd } });

    if (existing && existing.status === 'confirmed') {
      return res.status(409).json({ success: false, message: 'Diary for this date is already confirmed and cannot be re-uploaded.' });
    }

    if (existing) {
      existing.entries          = entries;
      existing.opening_balance  = openingBalance;
      existing.closing_balance  = closingBalance;
      existing.uploaded_by      = uploaded_by;
      existing.status           = 'draft';
      await existing.save();
      return res.json({ success: true, message: 'Diary draft updated', result: existing });
    }

    const draft = new DiaryDraft({
      diary_uuid:      uuid(),
      diary_date:      diaryDate,
      status:          'draft',
      uploaded_by,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      entries,
    });
    await draft.save();
    return res.status(201).json({ success: true, message: 'Diary draft created', result: draft });
  } catch (err) {
    logger.error({ err }, 'POST /diary/upload-csv');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/diary  — list all, newest first
router.get('/', async (req, res) => {
  try {
    const drafts = await DiaryDraft.find({}, { entries: 0 }).sort({ diary_date: -1 }).lean();
    return res.json({ success: true, result: drafts });
  } catch (err) {
    logger.error({ err }, 'GET /diary');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/diary/:uuid  — single diary with all entries
router.get('/:uuid', async (req, res) => {
  try {
    const draft = await DiaryDraft.findOne({ diary_uuid: req.params.uuid }).lean();
    if (!draft) return res.status(404).json({ success: false, message: 'Diary not found' });
    return res.json({ success: true, result: draft });
  } catch (err) {
    logger.error({ err }, 'GET /diary/:uuid');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/diary/:uuid/entry/:entryUuid  — assign account or update status for one entry
router.put('/:uuid/entry/:entryUuid', async (req, res) => {
  try {
    const { account_assigned, entry_status, notes } = req.body;
    const draft = await DiaryDraft.findOne({ diary_uuid: req.params.uuid });
    if (!draft) return res.status(404).json({ success: false, message: 'Diary not found' });
    if (draft.status === 'confirmed') {
      return res.status(400).json({ success: false, message: 'Diary is already confirmed' });
    }

    const setFields = {};
    if (account_assigned !== undefined) setFields['entries.$[e].account_assigned'] = account_assigned;
    if (entry_status     !== undefined) setFields['entries.$[e].entry_status']     = entry_status;
    if (notes            !== undefined) setFields['entries.$[e].notes']            = notes;

    await DiaryDraft.updateOne(
      { diary_uuid: req.params.uuid },
      { $set: setFields },
      { arrayFilters: [{ 'e.entry_uuid': req.params.entryUuid }] }
    );

    const updated = await DiaryDraft.findOne({ diary_uuid: req.params.uuid }).lean();
    return res.json({ success: true, result: updated });
  } catch (err) {
    logger.error({ err }, 'PUT /diary/:uuid/entry/:entryUuid');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/diary/:uuid/confirm  — confirm all assigned entries → create transactions
router.post('/:uuid/confirm', async (req, res) => {
  try {
    const { confirmed_by } = req.body;
    const draft = await DiaryDraft.findOne({ diary_uuid: req.params.uuid });
    if (!draft) return res.status(404).json({ success: false, message: 'Diary not found' });
    if (draft.status === 'confirmed') {
      return res.status(400).json({ success: false, message: 'Diary is already confirmed' });
    }

    let created = 0;
    for (const entry of draft.entries) {
      if (entry.entry_status === 'rejected') continue;
      if (!entry.account_assigned)           continue;

      const ledgerAccount = entry.book === 'bank' ? 'Bank' : 'Cash';
      const journal = entry.direction === 'in'
        ? [
            { Account_id: ledgerAccount,         Type: 'Debit',  Amount: entry.amount },
            { Account_id: entry.account_assigned, Type: 'Credit', Amount: entry.amount },
          ]
        : [
            { Account_id: entry.account_assigned, Type: 'Debit',  Amount: entry.amount },
            { Account_id: ledgerAccount,          Type: 'Credit', Amount: entry.amount },
          ];

      const counter = await Counter.findByIdAndUpdate(
        'transaction_number',
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      const paymentMode = PAYMENT_MODE_MAP[entry.mode] || 'Cash';
      const description = [entry.party, entry.notes].filter(Boolean).join(' - ');

      const txn = new Transaction({
        Transaction_uuid: uuid(),
        Transaction_id:   Number(counter?.seq || 1),
        Transaction_date: draft.diary_date,
        Description:      description,
        Total_Debit:      entry.amount,
        Total_Credit:     entry.amount,
        Payment_mode:     paymentMode,
        Created_by:       confirmed_by || 'diary',
        Journal_entry:    journal,
        Source:           'diary',
      });
      await txn.save();

      entry.transaction_uuid = txn.Transaction_uuid;
      entry.entry_status     = 'confirmed';
      created++;
    }

    draft.status = 'confirmed';
    await draft.save();
    return res.json({ success: true, message: `${created} transaction(s) created`, result: draft });
  } catch (err) {
    logger.error({ err }, 'POST /diary/:uuid/confirm');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/diary/:uuid  — delete draft only (not confirmed)
router.delete('/:uuid', async (req, res) => {
  try {
    const draft = await DiaryDraft.findOne({ diary_uuid: req.params.uuid });
    if (!draft) return res.status(404).json({ success: false, message: 'Diary not found' });
    if (draft.status === 'confirmed') {
      return res.status(400).json({ success: false, message: 'Cannot delete a confirmed diary' });
    }
    await DiaryDraft.deleteOne({ diary_uuid: req.params.uuid });
    return res.json({ success: true, message: 'Diary draft deleted' });
  } catch (err) {
    logger.error({ err }, 'DELETE /diary/:uuid');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
