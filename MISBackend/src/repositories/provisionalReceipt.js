const mongoose = require('mongoose');

// A receipt auto-generated from a payment screenshot a customer sent on
// WhatsApp. It is "provisional" by design: the amount is read from the
// customer's own screenshot, not from a confirmed bank credit, so the receipt
// acknowledges the claim and is settled only once the money actually lands in
// the business bank account. Nothing here posts to the accounting ledger — a
// separate, human-confirmed step does that.
const ALLOWED_STATUSES = ['provisional', 'confirmed', 'rejected'];

const provisionalReceiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, trim: true },
    customerUuid: { type: String, trim: true, default: '' },
    customerId: { type: String, trim: true, default: '' },
    customerName: { type: String, trim: true, default: '' },
    mobileNumber: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, trim: true, default: 'INR' },
    // The UPI transaction id / UTR read from the screenshot. Used to avoid
    // issuing two receipts for the same screenshot when a customer resends it.
    referenceId: { type: String, trim: true, default: '' },
    paidAtText: { type: String, trim: true, default: '' },
    payerName: { type: String, trim: true, default: '' },
    app: { type: String, trim: true, default: '' },
    payeeUpiId: { type: String, trim: true, default: '' },
    payeeName: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ALLOWED_STATUSES,
      default: 'provisional',
      index: true,
    },
    mediaUrl: { type: String, trim: true, default: '' },
    sourceMessageId: { type: String, trim: true, default: '' },
    rawOcr: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

provisionalReceiptSchema.index({ createdAt: -1 });
provisionalReceiptSchema.index({ customerUuid: 1 });
provisionalReceiptSchema.index({ mobileNumber: 1 });
// Sparse so the many receipts with no readable reference don't collide on ''.
provisionalReceiptSchema.index({ referenceId: 1 }, { sparse: true });

module.exports =
  mongoose.models.ProvisionalReceipt ||
  mongoose.model('ProvisionalReceipt', provisionalReceiptSchema);
module.exports.ALLOWED_STATUSES = ALLOWED_STATUSES;
