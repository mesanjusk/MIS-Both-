const mongoose = require('mongoose');

const baileysMessageSchema = new mongoose.Schema(
  {
    to:               { type: String, default: '' },
    from:             { type: String, default: '' },
    contactName:      { type: String, default: '' },
    conversationKey:  { type: String, default: '', index: true },
    baileysMessageId: { type: String, default: '' },
    replyToMessageId: { type: String, default: '' },
    direction:        { type: String, enum: ['INCOMING', 'OUTGOING'], required: true },
    source:           { type: String, default: 'MANUAL' },
    messageType:      { type: String, default: 'TEXT' },
    bodyText:         { type: String, default: '' },
    mediaUrl:         { type: String, default: '' },
    status:           { type: String, default: 'SENT' },
    isAutoReply:      { type: Boolean, default: false },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'baileys_messages' }
);

module.exports = mongoose.model('BaileysMessage', baileysMessageSchema);
