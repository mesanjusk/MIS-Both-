const asyncHandler   = require('../utils/asyncHandler');
const AppError       = require('../utils/AppError');
const BaileysMessage = require('../repositories/BaileysMessage');
const baileysService = require('../services/baileysService');
const { emitNewMessage } = require('../../socket');
const logger         = require('../utils/logger');

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '').trim();
}
function getConversationKey(phone) {
  return normalizePhone(phone);
}

// ── Wire incoming messages from Baileys service ───────────────────────────────
// Called once at startup via route registration
let _wired = false;
function wireIncomingMessages() {
  if (_wired) return;
  _wired = true;

  baileysService.onIncomingMessage(async ({ id, from, body, type, raw }) => {
    try {
      const existing = id
        ? await BaileysMessage.findOne({ baileysMessageId: id })
        : null;
      if (existing) return;

      const msg = await BaileysMessage.create({
        to:               '',
        from:             normalizePhone(from),
        conversationKey:  getConversationKey(from),
        baileysMessageId: id || '',
        direction:        'INCOMING',
        source:           'WEBHOOK',
        messageType:      String(type || 'TEXT').toUpperCase(),
        bodyText:         body || '',
        status:           'RECEIVED',
        meta:             raw || {},
      });

      emitNewMessage({ provider: 'baileys', event: 'new_message', message: msg });
    } catch (err) {
      logger.error({ err }, '[baileysCtrl] saveIncomingMessage error');
    }
  });
}

// ── Status & QR ───────────────────────────────────────────────────────────────

const getStatus = asyncHandler(async (_req, res) => {
  res.json(baileysService.getStatus());
});

const startConnection = asyncHandler(async (_req, res) => {
  logger.info('[baileys] /connect hit — starting connection');
  await baileysService.connect();
  res.json({ message: 'Baileys connecting…', status: baileysService.getStatus() });
});

const stopConnection = asyncHandler(async (_req, res) => {
  await baileysService.disconnect();
  res.json({ message: 'Baileys disconnected' });
});

// ── Inbox ─────────────────────────────────────────────────────────────────────

const getInbox = asyncHandler(async (_req, res) => {
  const messages = await BaileysMessage.find({ conversationKey: { $ne: '' } })
    .sort({ createdAt: -1 })
    .limit(400)
    .lean();

  const grouped = new Map();
  for (const item of messages) {
    const key = item.conversationKey || getConversationKey(item.from || item.to);
    if (!key) continue;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        conversationKey: key,
        phone:           key,
        contactName:     item.contactName || '',
        lastMessage:     item.bodyText || item.messageType,
        lastMessageAt:   item.createdAt,
        lastDirection:   item.direction,
        unreadCount:     item.direction === 'INCOMING' && item.status !== 'READ' ? 1 : 0,
        lastStatus:      item.status,
        messages:        1,
        provider:        'baileys',
      });
    } else {
      current.unreadCount += item.direction === 'INCOMING' && item.status !== 'READ' ? 1 : 0;
      current.messages    += 1;
      if (!current.contactName && item.contactName) current.contactName = item.contactName;
    }
  }

  res.json(
    Array.from(grouped.values()).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
  );
});

const getConversation = asyncHandler(async (req, res) => {
  const conversationKey = getConversationKey(req.params.conversationKey);
  const rows = await BaileysMessage.find({ conversationKey }).sort({ createdAt: 1 }).lean();
  res.json(rows);
});

const markConversationRead = asyncHandler(async (req, res) => {
  const conversationKey = getConversationKey(req.params.conversationKey);
  await BaileysMessage.updateMany(
    { conversationKey, direction: 'INCOMING', status: { $in: ['RECEIVED', 'DELIVERED'] } },
    { $set: { status: 'READ' } }
  );
  res.json({ message: 'Marked as read' });
});

// ── Send Text ──────────────────────────────────────────────────────────────────

const sendText = asyncHandler(async (req, res) => {
  const { to, text, contactName = '', replyToMessageId = '' } = req.body;
  if (!to || !text) throw new AppError('to and text are required', 400);

  try {
    const result = await baileysService.sendText({ to, body: text });
    const log = await BaileysMessage.create({
      to:               normalizePhone(to),
      from:             '',
      contactName,
      conversationKey:  getConversationKey(to),
      baileysMessageId: result?.key?.id || '',
      replyToMessageId,
      direction:        'OUTGOING',
      source:           'MANUAL',
      messageType:      'TEXT',
      bodyText:         text,
      status:           'SENT',
      meta:             result || {},
    });
    emitNewMessage({ provider: 'baileys', event: 'new_message', message: log });
    return res.status(201).json(log);
  } catch (error) {
    const log = await BaileysMessage.create({
      to:              normalizePhone(to),
      contactName,
      conversationKey: getConversationKey(to),
      direction:       'OUTGOING',
      source:          'MANUAL',
      messageType:     'TEXT',
      bodyText:        text,
      status:          'FAILED',
      meta:            { error: error.message },
    });
    return res.status(500).json(log);
  }
});

// ── Logs ──────────────────────────────────────────────────────────────────────

const getLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  const logs  = await BaileysMessage.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  res.json(logs);
});

// ── Provider Setting ──────────────────────────────────────────────────────────

const { getWhatsAppProvider, setWhatsAppProvider } = require('../services/whatsappProviderSetting');

const getProvider = asyncHandler(async (_req, res) => {
  const provider = await getWhatsAppProvider();
  res.json({ provider });
});

const updateProvider = asyncHandler(async (req, res) => {
  const { provider } = req.body;
  if (!provider) throw new AppError('provider is required', 400);
  const doc = await setWhatsAppProvider(provider);
  res.json({ message: 'Provider updated', provider: doc.value });
});

module.exports = {
  wireIncomingMessages,
  getStatus,
  startConnection,
  stopConnection,
  getInbox,
  getConversation,
  markConversationRead,
  sendText,
  getLogs,
  getProvider,
  updateProvider,
};
