const asyncHandler   = require('../utils/asyncHandler');
const AppError       = require('../utils/AppError');
const BaileysMessage = require('../repositories/BaileysMessage');
const Users          = require('../repositories/users');
const baileysService = require('../services/baileysService');
const { emitNewMessage } = require('../../socket');
const logger         = require('../utils/logger');

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '').trim();
}
function getConversationKey(phone) {
  return normalizePhone(phone);
}

// Cache of office user phone last-10 digits — refreshed every 5 minutes
let _userPhoneCache   = null;
let _userPhoneCacheAt = 0;

async function getOfficeUserPhones() {
  const now = Date.now();
  if (_userPhoneCache && now - _userPhoneCacheAt < 5 * 60 * 1000) return _userPhoneCache;
  const users = await Users.find({}, { Mobile_number: 1 }).lean();
  _userPhoneCache   = new Set(users.map((u) => normalizePhone(u.Mobile_number).slice(-10)).filter(Boolean));
  _userPhoneCacheAt = now;
  return _userPhoneCache;
}

function isOfficeUser(phone, userPhones) {
  const last10 = normalizePhone(phone).slice(-10);
  return last10 ? userPhones.has(last10) : false;
}

// ── Wire incoming messages from Baileys service ───────────────────────────────
// Called once at startup via route registration
let _wired = false;
function wireIncomingMessages() {
  if (_wired) return;
  _wired = true;

  baileysService.onIncomingMessage(async ({ id, from, groupId, isGroup, body, type, timestamp }) => {
    try {
      const existing = id ? await BaileysMessage.findOne({ baileysMessageId: id }) : null;
      if (existing) return;

      if (isGroup) {
        // Group message — save with chatType 'group'; conversationKey = groupId
        const msg = await BaileysMessage.create({
          to:               groupId,
          from:             normalizePhone(from),
          senderPhone:      normalizePhone(from),
          conversationKey:  groupId,
          groupId,
          chatType:         'group',
          baileysMessageId: id || '',
          direction:        'INCOMING',
          source:           'WEBHOOK',
          messageType:      String(type || 'TEXT').toUpperCase(),
          bodyText:         body || '',
          status:           'RECEIVED',
          meta:             { timestamp },
        });
        logger.info({ groupId, from, bodyLen: (body || '').length }, '[baileysCtrl] group message saved');
        emitNewMessage({ provider: 'baileys', event: 'new_message', message: msg });
        return;
      }

      // Individual message — skip office staff numbers
      const userPhones = await getOfficeUserPhones();
      if (isOfficeUser(from, userPhones)) return;

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
        chatType:         'individual',
        meta:             { timestamp },
      });

      logger.info({ from, bodyLen: (body || '').length }, '[baileysCtrl] message saved');
      emitNewMessage({ provider: 'baileys', event: 'new_message', message: msg });
    } catch (err) {
      logger.error({ err: err.message }, '[baileysCtrl] saveIncomingMessage error');
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
  const [messages, userPhones] = await Promise.all([
    BaileysMessage.find({ conversationKey: { $ne: '' }, chatType: { $ne: 'group' } })
      .sort({ createdAt: -1 })
      .limit(400)
      .lean(),
    getOfficeUserPhones(),
  ]);

  const grouped = new Map();
  for (const item of messages) {
    const key = item.conversationKey || getConversationKey(item.from || item.to);
    if (!key) continue;
    // Skip conversations belonging to office staff
    if (isOfficeUser(key, userPhones)) continue;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        conversationKey: key,
        phone:           key,
        contactName:     item.contactName || '',
        lastMessage:     item.bodyText || '',
        lastMessageType: item.messageType || 'TEXT',
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

// ── Groups ────────────────────────────────────────────────────────────────────

const getGroups = asyncHandler(async (_req, res) => {
  const groups = await baileysService.getGroups();
  res.json(groups);
});

const getGroupInbox = asyncHandler(async (_req, res) => {
  const messages = await BaileysMessage.find({ chatType: 'group', conversationKey: { $ne: '' } })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const grouped = new Map();
  for (const item of messages) {
    const key = item.groupId || item.conversationKey;
    if (!key) continue;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        conversationKey: key,
        groupId:         key,
        groupName:       item.groupName || '',
        lastMessage:     item.bodyText || '',
        lastMessageType: item.messageType || 'TEXT',
        lastMessageAt:   item.createdAt,
        lastDirection:   item.direction,
        unreadCount:     item.direction === 'INCOMING' && item.status !== 'READ' ? 1 : 0,
        messages:        1,
        provider:        'baileys',
      });
    } else {
      current.unreadCount += item.direction === 'INCOMING' && item.status !== 'READ' ? 1 : 0;
      current.messages    += 1;
      if (!current.groupName && item.groupName) current.groupName = item.groupName;
    }
  }

  res.json(Array.from(grouped.values()).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)));
});

const getGroupConversation = asyncHandler(async (req, res) => {
  const groupId = req.params.groupId;
  if (!groupId) throw new AppError('groupId is required', 400);
  const rows = await BaileysMessage.find({ chatType: 'group', conversationKey: groupId })
    .sort({ createdAt: 1 })
    .lean();
  res.json(rows);
});

const markGroupRead = asyncHandler(async (req, res) => {
  const groupId = req.params.groupId;
  if (!groupId) throw new AppError('groupId is required', 400);
  await BaileysMessage.updateMany(
    { chatType: 'group', conversationKey: groupId, direction: 'INCOMING', status: { $in: ['RECEIVED', 'DELIVERED'] } },
    { $set: { status: 'READ' } }
  );
  res.json({ message: 'Marked as read' });
});

// ── Send Text ──────────────────────────────────────────────────────────────────

const sendText = asyncHandler(async (req, res) => {
  const { to, text, contactName = '', replyToMessageId = '', groupName = '' } = req.body;
  if (!to || !text) throw new AppError('to and text are required', 400);

  const isGroupJid = String(to).includes('@g.us');
  const convKey    = isGroupJid ? to : getConversationKey(to);

  try {
    const result = await baileysService.sendText({ to, body: text });
    const log = await BaileysMessage.create({
      to:               isGroupJid ? to : normalizePhone(to),
      from:             '',
      contactName,
      conversationKey:  convKey,
      baileysMessageId: result?.key?.id || '',
      replyToMessageId,
      direction:        'OUTGOING',
      source:           'MANUAL',
      messageType:      'TEXT',
      bodyText:         text,
      status:           'SENT',
      chatType:         isGroupJid ? 'group' : 'individual',
      groupId:          isGroupJid ? to : '',
      groupName:        isGroupJid ? groupName : '',
      meta:             result || {},
    });
    emitNewMessage({ provider: 'baileys', event: 'new_message', message: log });
    return res.status(201).json(log);
  } catch (error) {
    const log = await BaileysMessage.create({
      to:              isGroupJid ? to : normalizePhone(to),
      contactName,
      conversationKey: convKey,
      direction:       'OUTGOING',
      source:          'MANUAL',
      messageType:     'TEXT',
      bodyText:        text,
      status:          'FAILED',
      chatType:        isGroupJid ? 'group' : 'individual',
      groupId:         isGroupJid ? to : '',
      groupName:       isGroupJid ? groupName : '',
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
  // group handlers
  getGroups,
  getGroupInbox,
  getGroupConversation,
  markGroupRead,
};
