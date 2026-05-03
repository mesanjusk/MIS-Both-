const mongoose = require('mongoose');

const ALLOWED_STATUSES = [
  'created',
  'initiated',
  'pending',
  'success',
  'failed',
  'cancelled',
  'expired',
];

const upiPaymentAttemptSchema = new mongoose.Schema(
  {
    payment_uuid: { type: String, trim: true },
    customerId: { type: String, trim: true, default: null },
    customerName: { type: String, trim: true, default: '' },
    mobileNumber: { type: String, trim: true, default: '' },
    relatedAccountId: { type: String, trim: true, default: null },
    relatedAccountName: { type: String, trim: true, default: '' },
    relatedOrderId: { type: String, trim: true, default: null },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, trim: true, default: 'INR' },
    note: { type: String, trim: true, default: '' },
    transactionRef: { type: String, required: true, trim: true, unique: true },
    payeeUpiId: { type: String, trim: true, default: '' },
    payeeName: { type: String, trim: true, default: '' },
    upiLink: { type: String, trim: true, default: '' },
    shareLink: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ALLOWED_STATUSES,
      default: 'created',
      index: true,
    },
    initiationSource: { type: String, trim: true, default: 'dashboard' },
    initiatedBy: { type: String, trim: true, default: null },
    appReturnPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    rawResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    transactionUuid: { type: String, trim: true, default: '' },
    transactionId: { type: Number, default: null },
    confirmedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

upiPaymentAttemptSchema.index({ createdAt: -1 });
upiPaymentAttemptSchema.index({ customerId: 1 });
upiPaymentAttemptSchema.index({ relatedAccountId: 1 });
upiPaymentAttemptSchema.index({ status: 1, createdAt: -1 });

const UpiPaymentAttempt = mongoose.model('UpiPaymentAttempt', upiPaymentAttemptSchema);

module.exports = { UpiPaymentAttempt, ALLOWED_STATUSES };
