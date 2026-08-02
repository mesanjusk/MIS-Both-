const mongoose = require('mongoose');

const EnquirySchema=new mongoose.Schema({
    Enquiry_uuid: { type: String },
    Enquiry_Number: { type: Number, required: true, unique: true },
    Customer_name: { type: String, required: true },
    Priority: { type: String, required: true },
    Item: { type: String, required: true },
    Task: { type: String, required: true },
    Assigned: { type: String, required: true },
    Delivery_Date: { type: Date, required: true },
    Remark: { type: String, required: true },

    // Set when this enquiry was auto-created from an inbound WhatsApp message
    // rather than typed in by staff — lets the team find/triage them separately.
    // whatsapp_auto = auto-detected from the API-connected number's webhook.
    // whatsapp_manual = staff saw a message on the regular (non-API) WhatsApp
    // Business number and logged it themselves via the quick-log shortcut.
    source: { type: String, enum: ['manual', 'whatsapp_auto', 'whatsapp_manual'], default: 'manual' },
    status: { type: String, enum: ['unreviewed', 'reviewed', 'converted', 'dismissed'], default: 'reviewed' },
    customerUuid: { type: String, default: null },
    mobileNumber: { type: String, default: null },
 },  { timestamps: true })

// Index definitions to improve query speed
EnquirySchema.index({ Customer_name: 1 });
EnquirySchema.index({ Priority: 1 });
EnquirySchema.index({ Item: 1 });
EnquirySchema.index({ Task: 1 });
EnquirySchema.index({ Assigned: 1 });
EnquirySchema.index({ Delivery_Date: 1 });
EnquirySchema.index({ status: 1 });
EnquirySchema.index({ source: 1 });

 const Enquiry = mongoose.model("Enquiry", EnquirySchema);

module.exports = Enquiry;
