const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const express = require('express');
const router  = express.Router();

const Transaction = require('../repositories/transaction');
const TransactionAudit = require('../repositories/transactionAudit');
const transactionNumber = require('../services/transactionNumberService');
const Orders      = require('../repositories/order');
const { refreshOrderPaymentStatus }    = require('../services/businessWorkflowService');
const { validateBalancedJournal }      = require('../services/accountingPostingService');
const { resolve: resolveAccount, isUuid, applyBalanceMovement } = require('../services/accountRegistry');
const { v4: uuid } = require('uuid');

const cloudinary = require('../utils/cloudinary.js');
const logger     = require('../utils/logger');
const { createUpload, limitRequestSize, MB, IMAGE_TYPES } = require('../middleware/uploadLimits');

// A transaction attachment is a receipt photo. It had no size limit at all and
// went straight into memory; Cloudinary resizes to 1920x1080 anyway, so 10 MB
// is ample.
const MAX_IMAGE_BYTES = 10 * MB;
const upload = createUpload({ maxFileBytes: MAX_IMAGE_BYTES, allowedMimeTypes: IMAGE_TYPES });
const boundRequest = limitRequestSize(MAX_IMAGE_BYTES + MB);

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

/** The authenticated user a posting is attributed to. */
function actingUser(req) {
  return String(req.user?.userName || req.user?.User_name || req.user?.id || 'unknown');
}

/** The financially meaningful shape of a transaction, for the audit trail. */
function auditSnapshot(txn) {
  if (!txn) return null;
  return {
    Transaction_date: txn.Transaction_date,
    Description:      txn.Description,
    Total_Debit:      txn.Total_Debit,
    Total_Credit:     txn.Total_Credit,
    Payment_mode:     txn.Payment_mode,
    Order_number:     txn.Order_number,
    Customer_uuid:    txn.Customer_uuid,
    Journal_entry:    (txn.Journal_entry || []).map((l) => ({
      Account_id: l.Account_id, Account_name: l.Account_name, Type: l.Type, Amount: l.Amount,
    })),
  };
}

/**
 * Append an audit row. Never fails the request: the mutation has already
 * happened, and losing the request would be worse than losing the trail entry,
 * which is logged loudly instead.
 */
async function recordAudit(req, { action, transaction, before, after }) {
  try {
    await TransactionAudit.create({
      Transaction_uuid: transaction.Transaction_uuid,
      Transaction_id:   transaction.Transaction_id ?? null,
      action,
      actor:    actingUser(req),
      actor_id: String(req.user?.id || ''),
      before:   before ? auditSnapshot(before) : null,
      after:    after  ? auditSnapshot(after)  : null,
    });
  } catch (err) {
    logger.error(`Transaction audit write failed for ${transaction.Transaction_uuid} (${action}): ${err.message}`);
  }
}

/**
 * Apply a balance movement and report failure instead of swallowing it.
 *
 * The transaction collection is the ledger of record; Accounts.Balance is a
 * running cache of it. When the cache write fails the transaction still stands,
 * so the request is not failed — but the caller is told, and the log carries
 * enough detail to re-run reconcile-account-balances.js.
 *
 * @returns {Promise<string|null>} warning message, or null when applied cleanly
 */
async function applyBalances(movement, context) {
  try {
    await applyBalanceMovement(movement);
    return null;
  } catch (err) {
    logger.error(`Account balance update failed while ${context}: ${err.message}`);
    return 'Transaction saved, but account balances could not be updated. Run the balance reconciliation script.';
  }
}

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

// Reading the ledger at all requires account access. Authentication alone used
// to be enough here, so a user with canViewAccounts=false still reached every
// transaction route including DELETE.
router.use(requirePermission('canViewAccounts'));

// ---------------------------------------------------------------------------
// POST /addTransaction  – create a new manual transaction
// ---------------------------------------------------------------------------

router.post('/addTransaction', requirePermission('canPostTransactions'), boundRequest, upload.single('image'), async (req, res) => {
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

    if (!Description || !Transaction_date || !Payment_mode) {
      return res.status(400).json({ success: false, message: 'Required fields are missing.' });
    }

    // The actor is whoever holds the token. Taking it from the body let any
    // caller attribute a posting to someone else.
    const actor = actingUser(req);

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
    let journalTotals;
    try {
      journalTotals = validateBalancedJournal(Journal_entry);
    } catch (balErr) {
      return res.status(400).json({ success: false, message: balErr.message });
    }

    const imageUrl = req.file ? await uploadToCloudinary(req.file) : null;

    // Atomic transaction ID (shared allocator — see transactionNumberService)
    const nextTransactionId = await transactionNumber.allocate();

    const newTransaction = new Transaction({
      Transaction_uuid: uuid(),
      Transaction_id:   nextTransactionId,
      Order_uuid:       Order_uuid  || null,
      Order_number:     toNum(Order_number) || null,
      Transaction_date,
      Total_Debit:      journalTotals.debit,
      Total_Credit:     journalTotals.credit,
      Journal_entry,
      Payment_mode,
      Description,
      image:            imageUrl,
      Created_by:       actor,
      Customer_uuid:    Customer_uuid    || null,
      Upi_reference:    Upi_reference    || '',
      Upi_status:       Upi_status       || '',
      Upi_app:          Upi_app          || '',
      Upi_payee_vpa:    Upi_payee_vpa    || '',
      Upi_response_raw: Upi_response_raw || null,
      Source:           Source           || '',
    });

    await newTransaction.save();

    await recordAudit(req, { action: 'create', transaction: newTransaction, after: newTransaction });

    // Update account balances. Awaited: a silent failure here is what lets the
    // stored balance drift away from the journal.
    const balanceWarning = await applyBalances(
      { apply: Journal_entry },
      `creating txn ${newTransaction.Transaction_uuid}`
    );

    // Refresh order payment status
    try {
      await refreshOrderPaymentStatus({ orderUuid: Order_uuid, orderNumber: Order_number });
    } catch (refreshErr) {
      logger.error(`refreshOrderPaymentStatus failed after saving txn ${newTransaction.Transaction_uuid}: ${refreshErr.message}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      result: newTransaction,
      ...(balanceWarning ? { balanceWarning } : {}),
    });
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

router.put('/:uuid', requirePermission('canEditTransactions'), boundRequest, upload.single('image'), async (req, res) => {
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

    // An edit may not blank the journal: an empty array used to bypass
    // validation entirely and leave the old balance movement stranded.
    if (!Array.isArray(rawJournal) || !rawJournal.length) {
      return res.status(400).json({ success: false, message: 'Journal_entry must be a non-empty array.' });
    }

    const badIdx = rawJournal.findIndex((e) => !e.Account_id || !e.Type || e.Amount === undefined);
    if (badIdx !== -1) {
      return res.status(400).json({ success: false, message: `Journal_entry[${badIdx}] is missing Account_id, Type, or Amount.` });
    }

    // Resolve account names → UUIDs in updated journal lines
    const Journal_entry = await resolveJournalAccounts(rawJournal);

    let journalTotals;
    try {
      journalTotals = validateBalancedJournal(Journal_entry);
    } catch (balErr) {
      return res.status(400).json({ success: false, message: balErr.message });
    }

    // The transaction as it stands before the edit: its journal is needed to
    // back the old movement out of the account balances, and the rest of it is
    // the audit trail's "before". Read before the update so it is not lost.
    const previous = await Transaction.findOne({ Transaction_uuid: transactionUuid }).lean();
    if (!previous) return res.status(404).json({ success: false, message: 'Transaction not found' });

    const imageUrl    = req.file ? await uploadToCloudinary(req.file) : undefined;

    const updateData = {
      Description,
      Transaction_date,
      Order_uuid:       Order_uuid || null,
      Order_number:     toNum(Order_number) || null,
      Total_Debit:      journalTotals.debit,
      Total_Credit:     journalTotals.credit,
      Payment_mode,
      // Created_by is deliberately not overwritten — it is who posted the
      // transaction. Who edited it is recorded in the audit trail below.
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

    await recordAudit(req, { action: 'edit', transaction: updated, before: previous, after: updated });

    // Net the superseded journal out and the new one in, in a single pass.
    const balanceWarning = await applyBalances(
      { reverse: previous.Journal_entry || [], apply: Journal_entry },
      `editing txn ${updated.Transaction_uuid}`
    );

    try {
      await refreshOrderPaymentStatus({ orderUuid: updated.Order_uuid, orderNumber: updated.Order_number });
    } catch (refreshErr) {
      logger.error(`refreshOrderPaymentStatus failed after editing txn ${updated.Transaction_uuid}: ${refreshErr.message}`);
    }

    return res.json({
      success: true,
      message: 'Transaction updated successfully',
      result: updated,
      ...(balanceWarning ? { balanceWarning } : {}),
    });
  } catch (error) {
    logger.error('Error in PUT /transactions/:uuid:', error);
    return res.status(500).json({ success: false, message: 'Failed to update transaction' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:uuid
// ---------------------------------------------------------------------------

router.delete('/:uuid', requirePermission('canDeleteTransactions'), async (req, res) => {
  try {
    const tx = await Transaction.findOne({ Transaction_uuid: req.params.uuid }).lean();
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });

    await Transaction.findOneAndDelete({ Transaction_uuid: req.params.uuid });

    await recordAudit(req, { action: 'delete', transaction: tx, before: tx });

    // Back the deleted journal's movement out of the account balances —
    // deletion used to leave it applied forever.
    const balanceWarning = await applyBalances(
      { reverse: tx.Journal_entry || [] },
      `deleting txn ${tx.Transaction_uuid}`
    );

    try {
      await refreshOrderPaymentStatus({ orderUuid: tx.Order_uuid, orderNumber: tx.Order_number });
    } catch (refreshErr) {
      logger.error(`refreshOrderPaymentStatus failed after deleting txn ${tx.Transaction_uuid}: ${refreshErr.message}`);
    }

    return res.json({
      success: true,
      message: 'Transaction deleted successfully',
      ...(balanceWarning ? { balanceWarning } : {}),
    });
  } catch (error) {
    logger.error('Error in DELETE /transactions/:uuid:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete transaction' });
  }
});

module.exports = router;
