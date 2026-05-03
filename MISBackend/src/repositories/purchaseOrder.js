const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    qty: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'Nos' },
    rate: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    PO_uuid: { type: String, unique: true, index: true },
    PO_Number: { type: Number, unique: true, index: true },
    Order_uuid: { type: String, default: '', index: true },
    Vendor_uuid: { type: String, required: true, index: true },
    Vendor_name: { type: String, default: '' },
    Items: { type: [purchaseOrderItemSchema], default: [] },
    totalAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'sent', 'received', 'cancelled'], default: 'draft', index: true },
    expectedDelivery: { type: Date, default: null },
    receivedDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

purchaseOrderSchema.pre('validate', function(next) {
  if (!this.PO_uuid) this.PO_uuid = uuidv4();
  this.Items = (this.Items || []).map((item) => ({
    ...item,
    amount: Number(item.amount || 0) || (Number(item.qty || 0) * Number(item.rate || 0)),
  }));
  this.totalAmount = (this.Items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  next();
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
