const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const Accounts = require('../repositories/accounts');
const Transaction = require('../repositories/transaction');
const {
  resolve: resolveAccount,
  updateBalancesForJournal,
  invalidateCache,
} = require('../services/accountRegistry');

const OPENING_BALANCE_SOURCE = 'opening:balance';

// GET /api/accounts/fix-opening-balance-uuid
// One-time cleanup — placed BEFORE requireAuth so it can be run from the browser.
router.get('/fix-opening-balance-uuid', async (_req, res) => {
  const OLD_UUID = '45d3945d-949b-436d-b7f9-e11dac1a8eb7';
  const NEW_UUID = '4cbfbba5-a50e-46fe-bd90-5877ea73e665';
  try {
    const targetAccount = await Accounts.findOne({ Account_uuid: NEW_UUID }).lean();
    if (!targetAccount) {
      return res.status(404).json({ error: 'Correct Opening Balance account not found' });
    }

    const txnsToUpdate = await Transaction.find({ 'Journal_entry.Account_id': OLD_UUID }).lean();
    let migratedTxns = 0;
    for (const txn of txnsToUpdate) {
      const updatedLines = (txn.Journal_entry || []).map((line) =>
        line.Account_id === OLD_UUID
          ? { ...line, Account_id: targetAccount.Account_uuid, Account_name: targetAccount.Account_name }
          : line
      );
      await Transaction.updateOne({ _id: txn._id }, { $set: { Journal_entry: updatedLines } });
      migratedTxns++;
    }

    const deleteResult = await Accounts.deleteOne({ Account_uuid: OLD_UUID });
    invalidateCache();

    return res.json({
      success: true,
      message: `Done. Migrated ${migratedTxns} transactions. Deleted duplicate account: ${deleteResult.deletedCount === 1 ? 'yes' : 'not found (already removed)'}`,
      migratedTransactions: migratedTxns,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const accounts = await Accounts.find({}).sort({ Account_code: 1 }).lean();
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts/opening-balance — existing opening balance entries keyed by account UUID
router.get('/opening-balance', async (_req, res) => {
  try {
    const txns = await Transaction.find({ Source: OPENING_BALANCE_SOURCE }).lean();
    // Build a map: accountUuid → { amount, side ('debit'|'credit'), transactionUuid }
    const map = {};
    for (const txn of txns) {
      for (const line of txn.Journal_entry || []) {
        const acctUuid = line.Account_id;
        // Skip the equity contra-account lines
        const name = String(line.Account_name || '').toLowerCase();
        if (name === 'opening balance equity') continue;
        map[acctUuid] = {
          amount: line.Amount,
          side: String(line.Type).toLowerCase(),
          transactionUuid: txn.Transaction_uuid,
        };
      }
    }
    res.json({ balances: map });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/opening-balance — upsert opening balance for one account
// Body: { accountUuid, amount, side ('debit'|'credit'), date? }
router.post('/opening-balance', async (req, res) => {
  try {
    const { accountUuid, amount, side, date } = req.body;
    const cleanAmount = Number(amount);
    if (!accountUuid || !Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return res.status(400).json({ error: 'accountUuid and a positive amount are required' });
    }
    if (side !== 'debit' && side !== 'credit') {
      return res.status(400).json({ error: "side must be 'debit' or 'credit'" });
    }

    // Resolve both accounts
    const [acctResult, equityResult] = await Promise.all([
      resolveAccount(accountUuid),
      resolveAccount('Opening Balance Equity'),
    ]);

    if (acctResult.name === acctResult.uuid) {
      return res.status(400).json({ error: `Account UUID '${accountUuid}' not found in Accounts collection` });
    }

    // Delete any existing opening balance transaction for this account so we can re-post
    const existingTxns = await Transaction.find({ Source: OPENING_BALANCE_SOURCE }).lean();
    for (const txn of existingTxns) {
      const hasThisAccount = (txn.Journal_entry || []).some(
        (l) => l.Account_id === acctResult.uuid && l.Account_name?.toLowerCase() !== 'opening balance equity'
      );
      if (hasThisAccount) {
        // Reverse balance impact before deleting
        const reversedLines = (txn.Journal_entry || []).map((l) => ({
          ...l,
          Type: l.Type === 'Debit' ? 'Credit' : 'Debit',
        }));
        await updateBalancesForJournal(reversedLines).catch(() => {});
        await Transaction.deleteOne({ _id: txn._id });
      }
    }

    // Build the new balanced journal entry
    const txnDate = date ? new Date(date) : new Date();
    const debitLine  = side === 'debit'
      ? { Account_id: acctResult.uuid,    Account_name: acctResult.name,    Type: 'Debit',  Amount: cleanAmount }
      : { Account_id: equityResult.uuid,  Account_name: equityResult.name,  Type: 'Debit',  Amount: cleanAmount };
    const creditLine = side === 'debit'
      ? { Account_id: equityResult.uuid,  Account_name: equityResult.name,  Type: 'Credit', Amount: cleanAmount }
      : { Account_id: acctResult.uuid,    Account_name: acctResult.name,    Type: 'Credit', Amount: cleanAmount };

    const Journal_entry = [debitLine, creditLine];

    const last = await Transaction.findOne().sort({ Transaction_id: -1 }).lean();
    const nextId = Number(last?.Transaction_id || 0) + 1;

    const txn = await Transaction.create({
      Transaction_uuid: uuidv4(),
      Transaction_id: nextId,
      Transaction_date: txnDate,
      Description: `Opening balance — ${acctResult.name}`,
      Total_Debit: cleanAmount,
      Total_Credit: cleanAmount,
      Payment_mode: 'Journal',
      Created_by: req.user?.userName || 'system',
      Journal_entry,
      Source: OPENING_BALANCE_SOURCE,
    });

    await updateBalancesForJournal(Journal_entry).catch(() => {});

    res.json({ transaction: txn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/opening-balance/bulk — batch upload from CSV text
// Body: { csv_text, date?, uploaded_by? }
router.post('/opening-balance/bulk', async (req, res) => {
  try {
    const { csv_text, date, uploaded_by } = req.body;
    if (!csv_text || !csv_text.trim()) {
      return res.status(400).json({ error: 'csv_text is required' });
    }

    const lines = csv_text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const sideCol = headers.includes('side') ? 'side' : headers.includes('dr_cr') ? 'dr_cr' : null;
    if (!headers.includes('account_name') || !headers.includes('amount') || !sideCol) {
      return res.status(400).json({ error: 'CSV must have columns: account_name, amount, side (or dr_cr)' });
    }

    const normSide = (raw) => {
      const s = String(raw || '').trim().toLowerCase();
      if (s === 'dr' || s === 'debit' || s === 'd') return 'debit';
      if (s === 'cr' || s === 'credit' || s === 'c') return 'credit';
      return null;
    };

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
      const accountName = row['account_name'];
      const amount = Number(String(row['amount'] || '0').replace(/[₹,\s]/g, ''));
      const side = normSide(row[sideCol]);
      const rowDate = row['date'] || date || null;
      if (!accountName || !amount || !side) continue;
      rows.push({ account_name: accountName, amount, side, date: rowDate });
    }

    if (!rows.length) {
      return res.status(400).json({ error: 'No valid rows found in CSV' });
    }

    // Resolve equity account once
    const equityResult = await resolveAccount('Opening Balance Equity');

    const results = [];
    for (const row of rows) {
      try {
        const acctResult = await resolveAccount(row.account_name);
        if (acctResult.name === acctResult.uuid) {
          results.push({ account_name: row.account_name, amount: row.amount, side: row.side, success: false, error: `Account "${row.account_name}" not found` });
          continue;
        }

        // Remove any existing opening balance for this account
        const existingTxns = await Transaction.find({ Source: OPENING_BALANCE_SOURCE }).lean();
        for (const txn of existingTxns) {
          const hasThisAccount = (txn.Journal_entry || []).some(
            (l) => l.Account_id === acctResult.uuid && l.Account_name?.toLowerCase() !== 'opening balance equity'
          );
          if (hasThisAccount) {
            const reversedLines = (txn.Journal_entry || []).map((l) => ({
              ...l,
              Type: l.Type === 'Debit' ? 'Credit' : 'Debit',
            }));
            await updateBalancesForJournal(reversedLines).catch(() => {});
            await Transaction.deleteOne({ _id: txn._id });
          }
        }

        const txnDate = row.date ? new Date(row.date) : (date ? new Date(date) : new Date());
        const debitLine = row.side === 'debit'
          ? { Account_id: acctResult.uuid, Account_name: acctResult.name, Type: 'Debit', Amount: row.amount }
          : { Account_id: equityResult.uuid, Account_name: equityResult.name, Type: 'Debit', Amount: row.amount };
        const creditLine = row.side === 'debit'
          ? { Account_id: equityResult.uuid, Account_name: equityResult.name, Type: 'Credit', Amount: row.amount }
          : { Account_id: acctResult.uuid, Account_name: acctResult.name, Type: 'Credit', Amount: row.amount };

        const Journal_entry = [debitLine, creditLine];
        const last = await Transaction.findOne().sort({ Transaction_id: -1 }).lean();
        const nextId = Number(last?.Transaction_id || 0) + 1;

        await Transaction.create({
          Transaction_uuid: uuidv4(),
          Transaction_id: nextId,
          Transaction_date: txnDate,
          Description: `Opening balance — ${acctResult.name}`,
          Total_Debit: row.amount,
          Total_Credit: row.amount,
          Payment_mode: 'Journal',
          Created_by: req.user?.userName || uploaded_by || 'system',
          Journal_entry,
          Source: OPENING_BALANCE_SOURCE,
        });

        await updateBalancesForJournal(Journal_entry).catch(() => {});
        results.push({ account_name: row.account_name, amount: row.amount, side: row.side, success: true, message: `Saved for ${acctResult.name}` });
      } catch (rowErr) {
        results.push({ account_name: row.account_name, amount: row.amount, side: row.side, success: false, error: rowErr.message });
      }
    }

    const saved = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    res.json({ results, summary: { total: results.length, saved, failed } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounts/opening-balance/:accountUuid — remove opening balance for one account
router.delete('/opening-balance/:accountUuid', async (req, res) => {
  try {
    const { accountUuid } = req.params;
    const txns = await Transaction.find({ Source: OPENING_BALANCE_SOURCE }).lean();
    let deleted = 0;
    for (const txn of txns) {
      const hasAccount = (txn.Journal_entry || []).some(
        (l) => l.Account_id === accountUuid && l.Account_name?.toLowerCase() !== 'opening balance equity'
      );
      if (hasAccount) {
        const reversedLines = (txn.Journal_entry || []).map((l) => ({
          ...l,
          Type: l.Type === 'Debit' ? 'Credit' : 'Debit',
        }));
        await updateBalancesForJournal(reversedLines).catch(() => {});
        await Transaction.deleteOne({ _id: txn._id });
        deleted++;
      }
    }
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounts/:uuid?migrateToUuid=<newUuid>
// Deletes an account record. If migrateToUuid is provided, all Journal_entry
// lines referencing the old UUID are updated to point to the new account instead.
router.delete('/:uuid', async (req, res) => {
  try {
    const { uuid: oldUuid } = req.params;
    const { migrateToUuid } = req.query;

    const accountToDelete = await Accounts.findOne({ Account_uuid: oldUuid }).lean();
    if (!accountToDelete) {
      return res.status(404).json({ error: 'Account not found' });
    }

    let migratedTxns = 0;
    if (migrateToUuid) {
      const targetAccount = await Accounts.findOne({ Account_uuid: migrateToUuid }).lean();
      if (!targetAccount) {
        return res.status(400).json({ error: 'migrateToUuid account not found' });
      }

      // Update all transactions that have journal lines referencing the old UUID
      const txnsToUpdate = await Transaction.find({ 'Journal_entry.Account_id': oldUuid }).lean();
      for (const txn of txnsToUpdate) {
        const updatedLines = (txn.Journal_entry || []).map((line) =>
          line.Account_id === oldUuid
            ? { ...line, Account_id: targetAccount.Account_uuid, Account_name: targetAccount.Account_name }
            : line
        );
        await Transaction.updateOne({ _id: txn._id }, { $set: { Journal_entry: updatedLines } });
        migratedTxns++;
      }
    }

    await Accounts.deleteOne({ Account_uuid: oldUuid });
    invalidateCache();

    return res.json({ success: true, deletedUuid: oldUuid, migratedTransactions: migratedTxns });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
