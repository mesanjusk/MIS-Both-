const mongoose = require('mongoose');
const crypto = require('crypto');

const publicInvoiceSchema = new mongoose.Schema(
  {
    shareToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(6).toString('hex'),
    },
    // 'invoice'  → sale invoice built from an order
    // 'receipt'  → money-received / money-paid voucher built from a ledger transaction
    docType:     { type: String, enum: ['invoice', 'receipt'], default: 'invoice', index: true },
    // 'receipt' (money in) | 'payment' (money out) | 'journal' — only used when docType === 'receipt'
    voucherType: { type: String, default: '' },
    orderNumber: { type: String, default: '', index: true },
    partyName:   { type: String, default: '' },
    dateStr:     { type: String, default: '' },
    // business profile snapshot at time of invoice
    storeName:    { type: String, default: '' },
    addressLines: { type: [String], default: [] },
    phone:  { type: String, default: '' },
    email:  { type: String, default: '' },
    gst:    { type: String, default: '' },
    upiId:  { type: String, default: '' },
    upiName:{ type: String, default: '' },
    // ledger transaction back-reference (receipt vouchers)
    transactionUuid: { type: String, default: '', index: true },
    transactionId:   { type: String, default: '' },
    paymentMode:     { type: String, default: '' },
    narration:       { type: String, default: '' },
    amount:          { type: Number, default: 0 },
    // line items
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
    extraCharges: { type: mongoose.Schema.Types.Mixed, default: [] },
    grandTotal: { type: Number, default: 0 },
    // optional cloudinary PDF url
    cloudinaryUrl: { type: String, default: '' },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true, collection: 'public_invoices' }
);

module.exports = mongoose.model('PublicInvoice', publicInvoiceSchema);
