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
    orderNumber: { type: String, default: '' },
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
