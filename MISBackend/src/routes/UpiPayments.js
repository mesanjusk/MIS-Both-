const express = require('express');
const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { UpiPaymentAttempt, ALLOWED_STATUSES } = require('../repositories/upiPaymentAttempt');

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

    const update = { status };
    if (Object.prototype.hasOwnProperty.call(req.body, 'appReturnPayload')) update.appReturnPayload = req.body.appReturnPayload;
    if (Object.prototype.hasOwnProperty.call(req.body, 'rawResponse')) update.rawResponse = req.body.rawResponse;
    if (Object.prototype.hasOwnProperty.call(req.body, 'note')) update.note = toTrimmedString(req.body.note);
    if (Object.prototype.hasOwnProperty.call(req.body, 'metadata')) update.metadata = req.body.metadata;
    if (Object.prototype.hasOwnProperty.call(req.body, 'transactionUuid')) update.transactionUuid = toTrimmedString(req.body.transactionUuid);
    if (Object.prototype.hasOwnProperty.call(req.body, 'transactionId')) update.transactionId = Number(req.body.transactionId) || null;
    if (status === 'success') update.confirmedAt = new Date();
    if (status === 'cancelled') update.cancelledAt = new Date();

    const result = await UpiPaymentAttempt.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!result) throw new AppError('UPI payment request not found', 404);

    return res.json({
      success: true,
      message: 'UPI payment request updated successfully',
      result: sanitizeAttempt(result),
    });
  })
);

module.exports = router;
