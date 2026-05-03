const mongoose = require('mongoose');

const journalSchema = new mongoose.Schema({
    Account_id: { type: String,  required: true},
    Type: { type: String, required: true },
    Amount: { type: Number, required: true } 
  });

const TransactionSchema=new mongoose.Schema({
    Transaction_uuid: { type: String },
    Transaction_id: { type: Number },
    Order_uuid: { type: String },
    Order_number: { type: Number },
    Transaction_date: { type: Date, required: true },
    Description: { type: String, required: true },
    Total_Debit: { type: Number, required: true },
    Total_Credit: { type: Number, required: true },
    Payment_mode: { type: String, required: true},
    Created_by: { type: String, required: true },
    image: { type: String },
    Journal_entry: [journalSchema],
    Customer_uuid: { type: String, default: null },
    Upi_reference: { type: String, default: '' },
    Upi_status: { type: String, default: '' },
    Upi_app: { type: String, default: '' },
    Upi_payee_vpa: { type: String, default: '' },
    Upi_response_raw: { type: mongoose.Schema.Types.Mixed, default: null },
    Source: { type: String, default: '' },
 },  { timestamps: true })

TransactionSchema.index({ Transaction_id: 1 });
TransactionSchema.index({ Order_uuid: 1 });
TransactionSchema.index({ Transaction_date: 1 });
TransactionSchema.index({ Payment_mode: 1 });
TransactionSchema.index({ Created_by: 1 });
TransactionSchema.index({ Customer_uuid: 1 });
TransactionSchema.index({ Upi_reference: 1 });

 const Transaction = mongoose.model("Transaction", TransactionSchema);

module.exports = Transaction;
