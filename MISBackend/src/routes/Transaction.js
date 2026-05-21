const { requireAuth } = require('../middleware/auth');
const express = require('express');
const router  = express.Router();

const Transaction = require('../repositories/transaction');
const Counter     = require('../repositories/counter');
const Orders      = require('../repositories/order');
const { refreshOrderPaymentStatus }    = require('../services/businessWorkflowService');
const { validateBalancedJournal }      = require('../services/accountingPostingService');
const { resolve: resolveAccount, isUuid, updateBalancesForJournal } = require('../services/accountRegistry');
const { v4: uuid } = require('uuid');

const multer     = require('multer');
const cloudinary = require('../utils/cloudinary.js');
const logger     = require('../utils/logger');

const storage = multer.memoryStorage();
const upload  = multer({ storage });

// ---------------------------------------------------------------------------
// Cloudinary helper
// ---------------------------------------------------------------------------

async function uploadToCloudinary(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:        'transactions',
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 1920, height: 1080, crop: 'limit', quality: 'auto:best' }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/[₹,\s]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function buildOrderFilter(Order_uuid, Order_number) {
  const ou = String(Order_uuid  || '').trim();
  const on = toNum(Order_number);
  if (ou) return { Order_uuid: ou };
  if (on) return { Order_Number: on };
  return null;
}

async function markOrderPaid({ Order_uuid, Order_number, txn }) {
  const filter = buildOrderFilter(Order_uuid, Order_number);
  if (!filter) return;
  await Orders.updateOne(filter, {
    $set: {
      billStatus:    'paid',
      billPaidAt:    new Date(),
      billPaidBy:    String(txn?.Created_by || 'system').trim(),
      billPaidNote:  String(txn?.Description || '').trim() || null,
      billPaidTxnUuid: txn?.Transaction_uuid || null,
      billPaidTxnId:   txn?.Transaction_id   ?? null,
    },
  });
}

async function maybeMarkOrderUnpaid({ Order_uuid, Order_number }) {
  const filter = buildOrderFilter(Order_uuid, Order_number);
  if (!filter) return;
  const stillExists = await Transaction.exists({
    $or: [
      ...(Order_uuid           ? [{ Order_uuid:   String(Order_uuid).trim() }] : []),
      ...(toNum(Order_number) ? [{ Order_number:  toNum(Order_number)       }] : []),
    ],
  });
  if (stillExists) return;
  await Orders.updateOne(filter, {
    $set: {
      billStatus:    'unpaid',
      billPaidAt:    null,
      billPaidBy:    null,
      billPaidNote:  null,
      billPaidTxnUuid: null,
      billPaidTxnId:   null,
    },
  });
}

/**
 * Resolve account identifiers inside a raw journal-entry array.
 *
 * Each element may have Account_id set to either:
 *   a) An account name string (legacy / frontend input) → resolved to UUID
 *   b) A UUID already                                  → used as-is
 *
 * Account_name is always populated with the human-readable name so that
 * display and heuristics (isBusinessCustomerReceipt) keep working.
 */
async function resolveJournalAccounts(rawLines = []) {
  return Promise.all(
    rawLines.map(async (line) => {
      const id  = String(line.Account_id || '').trim();
      const { uuid: accountUuid, name: accountName } = await resolveAccount(id);
      // accountName falls back to the UUID string itself when the ID is not in
      // the Accounts collection (e.g. a customer UUID used as an account ID).
      // In that case prefer the human-readable name sent by the frontend.
      const isUuidFallback = accountName === accountUuid;
      const resolvedName = isUuidFallback
        ? (line.Account_name && line.Account_name !== accountUuid ? line.Account_name : accountName)
        : (line.Account_name || accountName);
      return {
        Account_id:   accountUuid,
        Account_name: resolvedName,
        Type:         String(line.Type   || '').trim(),
        Amount:       toNum(line.Amount),
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

router.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /addTransaction  – create a new manual transaction
// ---------------------------------------------------------------------------

router.post('/addTransaction', upload.single('image'), async (req, res) => {
  try {
    const {
      Description,
      Transaction_date,
      Order_uuid,
      Order_number,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
      Journal_entry: journalEntryRaw,
      Customer_uuid,
      Upi_reference,
      Upi_status,
      Upi_app,
      Upi_payee_vpa,
      Upi_response_raw,
      Source,
    } = req.body;

    if (!Description || !Transaction_date || Total_Debit === undefined || Total_Credit === undefined || !Payment_mode || !Created_by) {
      return res.status(400).json({ success: false, message: 'Required fields are missing.' });
    }

    // Parse Journal_entry
    let rawJournal = [];
    try {
      if (typeof journalEntryRaw === 'string') rawJournal = JSON.parse(journalEntryRaw);
      else if (Array.isArray(journalEntryRaw)) rawJournal = journalEntryRaw;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON format for Journal_entry' });
    }

    if (!Array.isArray(rawJournal) || !rawJournal.length) {
      return res.status(400).json({ success: false, message: 'Journal_entry must be a non-empty array.' });
    }

    const badIdx = rawJournal.findIndex((e) => !e.Account_id || !e.Type || e.Amount === undefined);
    if (badIdx !== -1) {
      return res.status(400).json({ success: false, message: `Journal_entry[${badIdx}] is missing Account_id, Type, or Amount.` });
    }

    // Resolve account names → UUIDs (backward-compatible)
    const Journal_entry = await resolveJournalAccounts(rawJournal);

    // Enforce double-entry balance
    try {
      validateBalancedJournal(Journal_entry);
    } catch (balErr) {
      return res.status(400).json({ success: false, message: balErr.message });
    }

    const imageUrl = req.file ? await uploadToCloudinary(req.file) : null;

    // Atomic transaction ID
    const txnCounter = await Counter.findByIdAndUpdate(
      'transaction_number',
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const newTransaction = new Transaction({
      Transaction_uuid: uuid(),
      Transaction_id:   Number(txnCounter?.seq || 1),
      Order_uuid:       Order_uuid  || null,
      Order_number:     toNum(Order_number) || null,
      Transaction_date,
      Total_Debit:      toNum(Total_Debit),
      Total_Credit:     toNum(Total_Credit),
      Journal_entry,
      Payment_mode,
      Description,
      image:            imageUrl,
      Created_by,
      Customer_uuid:    Customer_uuid    || null,
      Upi_reference:    Upi_reference    || '',
      Upi_status:       Upi_status       || '',
      Upi_app:          Upi_app          || '',
      Upi_payee_vpa:    Upi_payee_vpa    || '',
      Upi_response_raw: Upi_response_raw || null,
      Source:           Source           || '',
    });

    await newTransaction.save();

    // Update account balances (non-blocking)
    updateBalancesForJournal(Journal_entry).catch(() => {});

    // Refresh order payment status
    try {
      await refreshOrderPaymentStatus({ orderUuid: Order_uuid, orderNumber: Order_number });
    } catch (refreshErr) {
      logger.error(`refreshOrderPaymentStatus failed after saving txn ${newTransaction.Transaction_uuid}: ${refreshErr.message}`);
    }

    return res.status(201).json({ success: true, message: 'Transaction created successfully', result: newTransaction });
  } catch (error) {
    logger.error('Error in /addTransaction:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /  – list with optional filters
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const { fromDate, toDate, paymentMode, createdBy, customerUuid, orderUuid, accountFilter, limit } = req.query;

    const filter = {};

    if (fromDate || toDate) {
      filter.Transaction_date = {};
      if (fromDate) filter.Transaction_date.$gte = new Date(fromDate);
      if (toDate)   filter.Transaction_date.$lte = new Date(toDate);
    }

    if (paymentMode)  filter.Payment_mode  = paymentMode;
    if (createdBy)    filter.Created_by    = createdBy;
    if (customerUuid) filter.Customer_uuid = customerUuid;
    if (orderUuid)    filter.Order_uuid    = String(orderUuid).trim();

    if (accountFilter) {
      const acct = String(accountFilter).trim();

      // If the caller supplies a UUID, use it directly.
      // Otherwise resolve the account name → UUID first so we always query by
      // stable UUID regardless of how the filter was expressed.
      let accountUuid = isUuid(acct) ? acct : null;

      if (!accountUuid) {
        try {
          // resolveAccount auto-creates missing accounts; use getUuid only when
          // the account is expected to exist already.
          const { getUuid } = require('../services/accountRegistry');
          accountUuid = await getUuid(acct);
        } catch {
          // Account not found – fall back to legacy name-string search so that
          // historical records (created before the UUID migration) are still found.
        }
      }

      if (accountUuid) {
        filter['Journal_entry.Account_id'] = accountUuid;
      } else {
        // Legacy fallback: search by account name in both Account_id and Account_name
        const variants = Array.from(new Set([acct, acct.toLowerCase(), acct.toUpperCase()]));
        filter.Journal_entry = {
          $elemMatch: {
            $or: [
              { Account_id:   { $in: variants } },
              { Account_name: { $in: variants } },
            ],
          },
        };
      }
    }

    const safeLimit = Math.min(Math.max(toNum(limit), 0), 2000);
    let query = Transaction.find(filter).sort({ Transaction_date: -1 });
    if (safeLimit) query = query.limit(safeLimit);

    const transactions = await query.lean();
    return res.json({ success: true, result: transactions });
  } catch (error) {
    logger.error('Error in GET /transactions:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

// ---------------------------------------------------------------------------
// GET /distinctPaymentModes
// ---------------------------------------------------------------------------

router.get('/distinctPaymentModes', async (req, res) => {
  try {
    const modes = await Transaction.distinct('Payment_mode');
    return res.json({ success: true, result: modes });
  } catch (error) {
    logger.error('Error in GET /transactions/distinctPaymentModes:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch modes' });
  }
});

// ---------------------------------------------------------------------------
// GET /:uuid  – single transaction
// ---------------------------------------------------------------------------

router.get('/:uuid', async (req, res) => {
  try {
    const tx = await Transaction.findOne({ Transaction_uuid: req.params.uuid }).lean();
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });
    return res.json({ success: true, result: tx });
  } catch (error) {
    logger.error('Error in GET /transactions/:uuid:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch transaction' });
  }
});

// ---------------------------------------------------------------------------
// PUT /:uuid  – update a transaction
// ---------------------------------------------------------------------------

router.put('/:uuid', upload.single('image'), async (req, res) => {
  try {
    const { uuid: transactionUuid } = req.params;

    const {
      Description,
      Transaction_date,
      Order_uuid,
      Order_number,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
      Journal_entry: journalEntryRaw,
      Customer_uuid,
      Upi_reference,
      Upi_status,
      Upi_app,
      Upi_payee_vpa,
      Upi_response_raw,
      Source,
    } = req.body;

    let rawJournal = [];
    try {
      if (typeof journalEntryRaw === 'string') rawJournal = JSON.parse(journalEntryRaw);
      else if (Array.isArray(journalEntryRaw)) rawJournal = journalEntryRaw;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON format for Journal_entry' });
    }

    // Resolve account names → UUIDs in updated journal lines
    const Journal_entry = rawJournal.length ? await resolveJournalAccounts(rawJournal) : [];

    if (Journal_entry.length) {
      try {
        validateBalancedJournal(Journal_entry);
      } catch (balErr) {
        return res.status(400).json({ success: false, message: balErr.message });
      }
    }

    const imageUrl    = req.file ? await uploadToCloudinary(req.file) : undefined;

    const updateData = {
      Description,
      Transaction_date,
      Order_uuid:       Order_uuid || null,
      Order_number:     toNum(Order_number) || null,
      Total_Debit:      toNum(Total_Debit),
      Total_Credit:     toNum(Total_Credit),
      Payment_mode,
      Created_by,
      Journal_entry,
      Customer_uuid:    Customer_uuid    || null,
      Upi_reference:    Upi_reference    || '',
      Upi_status:       Upi_status       || '',
      Upi_app:          Upi_app          || '',
      Upi_payee_vpa:    Upi_payee_vpa    || '',
      Upi_response_raw: Upi_response_raw || null,
      Source:           Source           || '',
    };
    if (imageUrl !== undefined) updateData.image = imageUrl;

    const updated = await Transaction.findOneAndUpdate(
      { Transaction_uuid: transactionUuid },
      updateData,
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: 'Transaction not found' });

    // Recalculate account balances after edit (non-blocking)
    if (Journal_entry.length) updateBalancesForJournal(Journal_entry).catch(() => {});

    try {
      await refreshOrderPaymentStatus({ orderUuid: updated.Order_uuid, orderNumber: updated.Order_number });
    } catch (refreshErr) {
      logger.error(`refreshOrderPaymentStatus failed after editing txn ${updated.Transaction_uuid}: ${refreshErr.message}`);
    }

    return res.json({ success: true, message: 'Transaction updated successfully', result: updated });
  } catch (error) {
    logger.error('Error in PUT /transactions/:uuid:', error);
    return res.status(500).json({ success: false, message: 'Failed to update transaction' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:uuid
// ---------------------------------------------------------------------------

router.delete('/:uuid', async (req, res) => {
  try {
    const tx = await Transaction.findOne({ Transaction_uuid: req.params.uuid }).lean();
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });

    await Transaction.findOneAndDelete({ Transaction_uuid: req.params.uuid });

    try {
      await refreshOrderPaymentStatus({ orderUuid: tx.Order_uuid, orderNumber: tx.Order_number });
    } catch (refreshErr) {
      logger.error(`refreshOrderPaymentStatus failed after deleting txn ${tx.Transaction_uuid}: ${refreshErr.message}`);
    }

    return res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    logger.error('Error in DELETE /transactions/:uuid:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete transaction' });
  }
});

module.exports = router;
