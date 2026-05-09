const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const attachmentSchema = new mongoose.Schema(
  {
    originalName:      { type: String, default: '' },
    fileSize:          { type: Number, default: 0 },
    mimeType:          { type: String, default: '' },
    storageMethod:     { type: String, enum: ['gmail_attachment', 'google_drive'], default: 'gmail_attachment' },
    driveFileId:       { type: String, default: '' },
    driveShareableLink:{ type: String, default: '' },
    // Parsed from filename format: "CustomerName - SizexSize=Qty - ItemName"
    parsedCustomer:    { type: String, default: '' },
    parsedSize:        { type: String, default: '' },
    parsedQty:         { type: Number, default: 0 },
    parsedItem:        { type: String, default: '' },
    parseSuccess:      { type: Boolean, default: false },
  },
  { _id: false }
);

const emailHistorySchema = new mongoose.Schema(
  {
    emailId:            { type: String, unique: true, index: true },
    fromGmailAccountId: { type: String, default: '', index: true },
    fromEmail:          { type: String, default: '' },
    sentBy:             { type: String, default: '' },
    toEmail:            { type: String, required: true, index: true },
    toName:             { type: String, default: '' },
    vendorUuid:         { type: String, default: '', index: true },
    subject:            { type: String, default: '' },
    bodyText:           { type: String, default: '' },
    attachments:        { type: [attachmentSchema], default: [] },
    orderUuid:          { type: String, default: '', index: true },
    // Reference to the auto-created Draft PO (if vendor email with parseable filenames)
    poUuid:             { type: String, default: '' },
    status:             { type: String, enum: ['sent', 'failed'], default: 'sent', index: true },
    gmailMessageId:     { type: String, default: '' },
    retryCount:         { type: Number, default: 0 },
    lastError:          { type: String, default: '' },
    sentAt:             { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

emailHistorySchema.pre('validate', function (next) {
  if (!this.emailId) this.emailId = uuidv4();
  next();
});

module.exports = mongoose.model('EmailHistory', emailHistorySchema);
