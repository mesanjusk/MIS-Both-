const express = require('express');
const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { UpiPaymentAttempt, ALLOWED_STATUSES } = require('../repositories/upiPaymentAttempt');
const Orders = require('../repositories/order');
const Customer = require('../repositories/customer');
const Transaction = require('../repositories/transaction');
const {
  BUSINESS_SOURCES,
  postCustomerAdvance,
  postCustomerReceipt,
  reverseAndDeleteTransaction,
} = require('../services/accountingPostingService');

const router = express.Router();

const toTrimmedString = (value) => String(value || '').trim();

const parsePositiveAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Number(amount.toFixed(2));
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const normalizeStatus = (value) => toTrimmedString(value).toLowerCase();

const buildUpiLink = ({ payeeUpiId, payeeName, amount, note, transactionRef, currency = 'INR' }) => {
  const cleanVpa = toTrimmedString(payeeUpiId);
  const cleanName = toTrimmedString(payeeName);
  if (!cleanVpa || !cleanName) return '';

  const params = new URLSearchParams({
    pa: cleanVpa,
    pn: cleanName,
    am: String(amount),
    cu: currency,
    tr: transactionRef,
  });

  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
};

const buildShareLink = (req, transactionRef) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  return `${origin}/upi/collect/${encodeURIComponent(transactionRef)}`;
};

const buildOrderLookup = (rawId) => {
  const raw = toTrimmedString(rawId);
  if (!raw) return null;
  const clauses = [{ Order_uuid: raw }];
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) clauses.push({ Order_Number: n });
  if (mongoose.Types.ObjectId.isValid(raw)) clauses.push({ _id: raw });
  return { $or: clauses };
};

async function resolveAttemptContext(attempt) {
  const orderLookup = buildOrderLookup(attempt.relatedOrderId);
  const order = orderLookup ? await Orders.findOne(orderLookup).lean() : null;

  let customerUuid = order?.Customer_uuid || '';
  if (!customerUuid && attempt.customerId) {
    const raw = toTrimmedString(attempt.customerId);
    const clauses = [{ Customer_uuid: raw }];
    if (mongoose.Types.ObjectId.isValid(raw)) clauses.push({ _id: raw });
    const customer = await Customer.findOne({ $or: clauses }).lean();
    customerUuid = customer?.Customer_uuid || '';
  }

  return { order, customerUuid };
}

const isOwnedUpiPosting = (txn) => {
  const source = String(txn?.Source || '');
  return (
    source.startsWith(BUSINESS_SOURCES.CUSTOMER_RECEIPT) ||
    source.startsWith(BUSINESS_SOURCES.CUSTOMER_ADVANCE)
  ) && source.includes(':upi:');
};

async function ensureSuccessfulPaymentPosting(attempt, actor = 'system') {
  if (attempt.transactionUuid) {
    const linked = await Transaction.findOne({ Transaction_uuid: attempt.transactionUuid }).lean();
    if (linked) return linked;
  }

  const { order, customerUuid } = await resolveAttemptContext(attempt);
  const sourceSuffix = `upi:${attempt.payment_uuid || attempt.transactionRef}`;
  const common = {
    amount: attempt.amount,
    paymentMode: 'UPI',
    orderUuid: order?.Order_uuid || null,
    orderNumber: order?.Order_Number || null,
    customerUuid: customerUuid || null,
    createdBy: actor,
    transactionDate: new Date(),
    partyName: attempt.customerName || '',
    narration: attempt.note || 'UPI payment confirmed',
    reference: attempt.transactionRef,
    sourceSuffix,
    allowDuplicate: false,
  };

  let posting;
  if (order) {
    const hasInvoice = await Transaction.exists({
      Order_uuid: order.Order_uuid,
      Source: `${BUSINESS_SOURCES.CUSTOMER_INVOICE}:${order.Order_uuid}`,
    });
    const isAfterInvoice = Boolean(hasInvoice) || ['delivered', 'paid'].includes(String(order.stage || '').toLowerCase());
    posting = isAfterInvoice
      ? await postCustomerReceipt(common)
      : await postCustomerAdvance(common);
  } else {
    posting = await postCustomerAdvance(common);
  }

  if (!posting?.transaction?.Transaction_uuid) {
    throw new AppError('UPI success could not be linked to a ledger transaction', 500);
  }
  return posting.transaction;
}

const sanitizeAttempt = (doc) => {
  if (!doc) return null;
  return {
    _id: doc._id,
    payment_uuid: doc.payment_uuid,
    customerId: doc.customerId,
    customerName: doc.customerName,
    mobileNumber: doc.mobileNumber,
    relatedAccountId: doc.relatedAccountId,
    relatedAccountName: doc.relatedAccountName,
    relatedOrderId: doc.relatedOrderId,
    amount: doc.amount,
    currency: doc.currency,
    note: doc.note,
    transactionRef: doc.transactionRef,
    payeeUpiId: doc.payeeUpiId,
    payeeName: doc.payeeName,
    upiLink: doc.upiLink,
    shareLink: doc.shareLink,
    status: doc.status,
    initiationSource: doc.initiationSource,
    initiatedBy: doc.initiatedBy,
    appReturnPayload: doc.appReturnPayload,
    rawResponse: doc.rawResponse,
    metadata: doc.metadata,
    transactionUuid: doc.transactionUuid,
    transactionId: doc.transactionId,
    confirmedAt: doc.confirmedAt,
    cancelledAt: doc.cancelledAt,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

router.get(
  '/public/:transactionRef',
  asyncHandler(async (req, res) => {
    const transactionRef = toTrimmedString(req.params.transactionRef);
    if (!transactionRef) throw new AppError('transactionRef is required', 400);

    const result = await UpiPaymentAttempt.findOne({ transactionRef }).lean();
    if (!result) throw new AppError('UPI payment request not found', 404);

    return res.json({ success: true, result: sanitizeAttempt(result) });
  })
);

router.use(requireAuth);

router.post(
  '/payments/attempt',
  asyncHandler(async (req, res) => {
    const amount = parsePositiveAmount(req.body.amount);
    const transactionRef = toTrimmedString(req.body.transactionRef);
    const status = normalizeStatus(req.body.status || 'pending') || 'pending';

    if (!amount) throw new AppError('Valid amount is required', 400);
    if (!transactionRef) throw new AppError('transactionRef is required', 400);
    if (!ALLOWED_STATUSES.includes(status)) throw new AppError('Invalid status', 400);

    const note = toTrimmedString(req.body.note);
    const currency = 'INR';
    const payeeUpiId = toTrimmedString(req.body.payeeUpiId);
    const payeeName = toTrimmedString(req.body.payeeName);
    const upiLink = buildUpiLink({
      payeeUpiId,
      payeeName,
      amount,
      note,
      transactionRef,
      currency,
    });

    let attempt;
    try {
      attempt = await UpiPaymentAttempt.create({
        payment_uuid: uuid(),
        customerId: toTrimmedString(req.body.customerId) || null,
        customerName: toTrimmedString(req.body.customerName),
        mobileNumber: toTrimmedString(req.body.mobileNumber),
        relatedAccountId: toTrimmedString(req.body.relatedAccountId) || null,
        relatedAccountName: toTrimmedString(req.body.relatedAccountName),
        relatedOrderId: toTrimmedString(req.body.relatedOrderId) || null,
        amount,
        currency,
        note,
        transactionRef,
        payeeUpiId,
        payeeName,
        upiLink,
        shareLink: buildShareLink(req, transactionRef),
        status,
        initiationSource: toTrimmedString(req.body.initiationSource) || 'dashboard',
        initiatedBy: toTrimmedString(req.user?.id) || null,
        appReturnPayload: req.body.appReturnPayload || null,
        rawResponse: req.body.rawResponse || null,
        metadata: req.body.metadata || null,
        expiresAt: req.body.expiresAt || null,
      });
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.transactionRef) {
        throw new AppError('transactionRef already exists', 409);
      }
      throw error;
    }

    if (status === 'success') {
      try {
        const txn = await ensureSuccessfulPaymentPosting(
          attempt,
          req.user?.userName || req.user?.name || req.user?.id || 'system'
        );
        attempt = await UpiPaymentAttempt.findByIdAndUpdate(
          attempt._id,
          {
            $set: {
              transactionUuid: txn.Transaction_uuid,
              transactionId: txn.Transaction_id ?? null,
              confirmedAt: new Date(),
            },
          },
          { new: true, runValidators: true }
        );
      } catch (error) {
        await UpiPaymentAttempt.deleteOne({ _id: attempt._id }).catch(() => {});
        throw error;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'UPI payment request created successfully',
      result: sanitizeAttempt(attempt),
    });
  })
);

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const status = normalizeStatus(req.query.status);
    const customerId = toTrimmedString(req.query.customerId);
    const onlyPending = String(req.query.onlyPending || '').toLowerCase() === 'true';

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);

    const filter = {};
    if (status) {
      if (!ALLOWED_STATUSES.includes(status)) throw new AppError('Invalid status filter', 400);
      filter.status = status;
    }
    if (onlyPending) filter.status = { $in: ['created', 'initiated', 'pending'] };
    if (customerId) filter.customerId = customerId;

    const [result, total] = await Promise.all([
      UpiPaymentAttempt.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UpiPaymentAttempt.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      result: result.map(sanitizeAttempt),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

router.get(
  '/payments/tx/:transactionRef',
  asyncHandler(async (req, res) => {
    const transactionRef = toTrimmedString(req.params.transactionRef);
    const result = await UpiPaymentAttempt.findOne({ transactionRef }).lean();
    if (!result) throw new AppError('UPI payment request not found', 404);
    return res.json({ success: true, result: sanitizeAttempt(result) });
  })
);

router.get(
  '/payments/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) throw new AppError('Invalid payment request id', 400);

    const result = await UpiPaymentAttempt.findById(id).lean();
    if (!result) throw new AppError('UPI payment request not found', 404);
    return res.json({ success: true, result: sanitizeAttempt(result) });
  })
);

router.patch(
  '/payments/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) throw new AppError('Invalid payment request id', 400);

    const status = normalizeStatus(req.body.status);
    if (!ALLOWED_STATUSES.includes(status)) throw new AppError('Invalid status', 400);

    const current = await UpiPaymentAttempt.findById(id);
    if (!current) throw new AppError('UPI payment request not found', 404);

    const update = { status };
    if (Object.prototype.hasOwnProperty.call(req.body, 'appReturnPayload')) update.appReturnPayload = req.body.appReturnPayload;
    if (Object.prototype.hasOwnProperty.call(req.body, 'rawResponse')) update.rawResponse = req.body.rawResponse;
    if (Object.prototype.hasOwnProperty.call(req.body, 'note')) update.note = toTrimmedString(req.body.note);
    if (Object.prototype.hasOwnProperty.call(req.body, 'metadata')) update.metadata = req.body.metadata;

    if (status === 'success') {
      const txn = await ensureSuccessfulPaymentPosting(
        current,
        req.user?.userName || req.user?.name || req.user?.id || 'system'
      );
      update.transactionUuid = txn.Transaction_uuid;
      update.transactionId = txn.Transaction_id ?? null;
      update.confirmedAt = current.confirmedAt || new Date();
      update.cancelledAt = null;
    } else if (current.status === 'success' && current.transactionUuid) {
      const txn = await Transaction.findOne({ Transaction_uuid: current.transactionUuid }).lean();
      if (txn && !isOwnedUpiPosting(txn)) {
        throw new AppError(
          'This successful UPI attempt is linked to a legacy/shared transaction and cannot be automatically reversed',
          409
        );
      }
      if (txn) await reverseAndDeleteTransaction({ Transaction_uuid: current.transactionUuid });
      update.transactionUuid = '';
      update.transactionId = null;
      update.confirmedAt = null;
    }

    if (status === 'cancelled') update.cancelledAt = new Date();

    const result = await UpiPaymentAttempt.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();

    return res.json({
      success: true,
      message: 'UPI payment request updated successfully',
      result: sanitizeAttempt(result),
    });
  })
);

module.exports = router;
// Exposed for unit testing — otherwise only reachable through the HTTP routes above.
module.exports.parsePositiveAmount = parsePositiveAmount;
module.exports.isValidObjectId = isValidObjectId;
module.exports.normalizeStatus = normalizeStatus;
module.exports.buildUpiLink = buildUpiLink;
module.exports.buildShareLink = buildShareLink;
module.exports.sanitizeAttempt = sanitizeAttempt;
