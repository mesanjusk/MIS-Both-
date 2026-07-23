/**
 * Baileys WhatsApp service for MIS project.
 *
 * Handles QR-based WhatsApp Web connection, sending text/image messages,
 * and auto-reconnect on server restart if credentials are saved in MongoDB.
 */

const { emitNewMessage } = require('../../socket');
const { useMongoAuthState, clearMongoAuthState } = require('./baileysAuthState');
const { uploadBufferToCloudinary } = require('./whatsappMediaService');
const logger = require('../utils/logger');

const MAX_RECONNECT_ATTEMPTS = 5;

// Baileys numeric message status -> our status string
// (WAMessageStatus: ERROR=0, PENDING=1, SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5)
const STATUS_MAP = { 0: 'FAILED', 1: 'PENDING', 2: 'SENT', 3: 'DELIVERED', 4: 'READ', 5: 'READ' };

let baileysState   = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket  = null;
let reconnectTimer = null;
let isConnecting   = false;
let reconnectCount = 0;
let currentPinoLogger = null;

// Listeners registered by the controller layer for incoming messages / status updates
const incomingListeners = [];
const statusListeners   = [];

// ── helpers ───────────────────────────────────────────────────────────────────

async function getWASocketAndVersion() {
  const mod = await import('@whiskeysockets/baileys');

  const makeWASocket = mod.default?.makeWASocket
    ?? mod.makeWASocket
    ?? mod.default
    ?? mod;

  const fetchLatestBaileysVersion = mod.fetchLatestBaileysVersion
    ?? mod.default?.fetchLatestBaileysVersion;

  const proto = mod.proto ?? mod.default?.proto;

  let version = [2, 3000, 1023024415]; // fallback

  if (typeof fetchLatestBaileysVersion === 'function') {
    try {
      const result = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000)),
      ]);
      if (Array.isArray(result?.version) && result.version.length === 3) {
        version = result.version;
        logger.info({ version: version.join('.') }, '[baileys] live WA version fetched');
      }
    } catch (e) {
      logger.warn({ err: e.message }, '[baileys] version fetch failed — using fallback');
    }
  }

  return { makeWASocket, version, proto };
}

async function toQrDataUrl(raw) {
  try {
    const qrcode = (await import('qrcode')).default;
    return await qrcode.toDataURL(raw, { width: 300 });
  } catch {
    return raw;
  }
}

function formatJid(to) {
  const s = String(to || '');
  if (s.includes('@')) return s; // already a full JID — pass through (groups @g.us or individuals @s.whatsapp.net)
  const clean = s.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}

function detectMediaType(m) {
  if (m.imageMessage)    return 'IMAGE';
  if (m.videoMessage)    return m.videoMessage.gifPlayback ? 'GIF' : 'VIDEO';
  if (m.audioMessage)    return 'AUDIO';
  if (m.documentMessage) return 'DOCUMENT';
  if (m.stickerMessage)  return 'STICKER';
  return '';
}

async function downloadAndUploadMedia(sock, msg, mediaType) {
  try {
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { logger: currentPinoLogger, reuploadRequest: sock.updateMediaMessage }
    );
    const mimetype = msg.message?.[`${mediaType.toLowerCase()}Message`]?.mimetype
      || msg.message?.[`${mediaType === 'GIF' ? 'video' : mediaType.toLowerCase()}Message`]?.mimetype
      || '';
    const upload = await uploadBufferToCloudinary({ buffer, mimeType: mimetype, folder: 'baileys_media' });
    return { mediaUrl: upload.secure_url, mimeType: mimetype };
  } catch (err) {
    logger.error({ err: err.message }, '[baileys] media download/upload failed');
    return { mediaUrl: '', mimeType: '' };
  }
}

// WhatsApp's privacy rollout hides real phone numbers behind a `@lid`
// (Linked ID) JID for many senders. Baileys does not silently translate
// these — remoteJid/participant come through as `<digits>@lid`, and the
// caller must resolve the real number itself:
//   1. Prefer the companion phone-number JID Baileys attaches to the key
//      (`senderPn` for 1:1 chats, `participantPn` for group messages) when
//      WhatsApp included it inline.
//   2. Otherwise consult Baileys' persisted LID<->PN map
//      (`sock.signalRepository.lidMapping`), populated from history sync
//      and lid-migration protocol messages.
//   3. If neither is known yet, WhatsApp simply hasn't revealed this
//      contact's number (privacy setting, or mapping not learned yet) —
//      surface the LID as-is but flag it so downstream code doesn't treat
//      it as a real phone number.
async function resolveSenderPhone(sock, msg, senderJid, isGroup) {
  if (!senderJid) return { phone: '', isLid: false };
  if (!senderJid.endsWith('@lid')) {
    return { phone: senderJid.split('@')[0], isLid: false };
  }

  const altJid = isGroup ? msg.key?.participantPn : msg.key?.senderPn;
  if (altJid) return { phone: altJid.split('@')[0], isLid: false };

  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(senderJid);
    if (pn) return { phone: pn.split('@')[0], isLid: false };
  } catch (err) {
    logger.warn({ err: err.message, senderJid }, '[baileys] lidMapping.getPNForLID failed');
  }

  return { phone: senderJid.split('@')[0], isLid: true };
}

// Group subjects rarely change — cache them briefly instead of calling
// groupMetadata() on every single incoming group message.
const GROUP_NAME_TTL_MS = 10 * 60 * 1000;
const groupNameCache = new Map(); // groupJid -> { name, at }

async function resolveGroupName(sock, groupJid) {
  const cached = groupNameCache.get(groupJid);
  if (cached && Date.now() - cached.at < GROUP_NAME_TTL_MS) return cached.name;
  try {
    const meta = await sock.groupMetadata(groupJid);
    const name = meta?.subject || '';
    groupNameCache.set(groupJid, { name, at: Date.now() });
    return name;
  } catch (err) {
    logger.warn({ err: err.message, groupJid }, '[baileys] groupMetadata fetch failed');
    return cached?.name || '';
  }
}

async function normalizeBaileysMessage(sock, msg) {
  const jid         = msg.key?.remoteJid || '';
  const isGroup      = jid.endsWith('@g.us');
  const participant = msg.key?.participant || msg.participant || '';
  const senderJid   = isGroup ? participant : jid;
  const { phone: senderPhone, isLid } = await resolveSenderPhone(sock, msg, senderJid, isGroup);
  // pushName is the sender's own WhatsApp display name — the same
  // fallback Baileys' own examples use when a contact's saved name isn't
  // known locally.
  const contactName = !isGroup ? (msg.pushName || '') : '';
  const groupName   = isGroup ? await resolveGroupName(sock, jid) : '';
  const m = msg.message || {};
  const body =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedId ||
    '';
  const mediaType = detectMediaType(m);
  const fileName  = m.documentMessage?.fileName || '';

  let mediaUrl = '';
  let mimeType = '';
  if (mediaType) {
    const uploaded = await downloadAndUploadMedia(sock, msg, mediaType);
    mediaUrl = uploaded.mediaUrl;
    mimeType = uploaded.mimeType;
  }

  return {
    id:          msg.key?.id || '',
    from:        senderPhone,
    isLid,
    contactName,
    groupId:     isGroup ? jid : '',
    groupName,
    isGroup,
    body:        body || (mediaType ? `[${mediaType}]` : ''),
    type:        mediaType ? mediaType.toLowerCase() : 'text',
    mediaUrl,
    mimeType,
    fileName,
    timestamp:   msg.messageTimestamp,
  };
}

function killSocket() {
  if (baileysSocket) {
    try { baileysSocket.end(undefined); } catch (_) {}
    baileysSocket = null;
  }
}

// Emit to all registered incoming listeners (from controller layer)
function emitIncoming(normalizedMsg) {
  for (const fn of incomingListeners) {
    try { fn(normalizedMsg); } catch (err) { logger.error({ err }, '[baileys] incoming listener error'); }
  }
  // Also emit via socket.io for live UI updates
  try { emitNewMessage({ provider: 'baileys', ...normalizedMsg }); } catch (_) {}
}

// ── public API ────────────────────────────────────────────────────────────────

function getStatus() {
  return { ...baileysState };
}

function onIncomingMessage(fn) {
  incomingListeners.push(fn);
}

function onMessageStatus(fn) {
  statusListeners.push(fn);
}

async function connect() {
  if (isConnecting) {
    logger.info('[baileys] resetting stuck isConnecting flag...');
    isConnecting = false;
  }
  isConnecting = true;
  logger.info('[baileys] connect() called — starting Baileys socket...');

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  killSocket();

  try {
    const { makeWASocket, version, proto } = await getWASocketAndVersion();
    const pino   = (await import('pino')).default;
    const pinoLogger = pino({ level: 'silent' });
    currentPinoLogger = pinoLogger;

    const { state, saveCreds } = await useMongoAuthState();

    // proto.HistorySync.HistorySyncType.FULL === 2
    const HISTORY_SYNC_TYPE_FULL = proto?.HistorySync?.HistorySyncType?.FULL ?? 2;

    const sock = makeWASocket({
      version,
      logger: pinoLogger,
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: state.keys },
      browser: ['MIS App', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory:                false,
      // IMPORTANT: leaving shouldSyncHistoryMessage unset makes Baileys 7.x
      // fall back to `() => !!syncFullHistory`, i.e. `() => false` — which
      // rejects *every* sync type, not just the full-history download.
      // Without it, WhatsApp never sends LID<->phone-number mappings or
      // group participant data to this device, so senders show up as raw
      // LIDs (158617571471610 etc.) instead of phone numbers. Accept every
      // sync type except the expensive full-history one.
      shouldSyncHistoryMessage: ({ syncType }) => syncType !== HISTORY_SYNC_TYPE_FULL,
      markOnlineOnConnect:            false,
      connectTimeoutMs:    60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 500,
    });

    baileysSocket = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('[baileys] QR received — emitting to dashboard');
        const qrDataUrl = await toQrDataUrl(qr);
        baileysState = { qr: qrDataUrl, status: 'QR_PENDING', phone: '' };
        try { emitNewMessage({ provider: 'baileys', type: 'status', ...baileysState }); } catch (_) {}
      }

      if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0] || sock.user?.id || '';
        baileysState = { qr: null, status: 'CONNECTED', phone };
        try { emitNewMessage({ provider: 'baileys', type: 'status', ...baileysState }); } catch (_) {}
        logger.info({ phone }, '[baileys] connected');
        isConnecting   = false;
        reconnectCount = 0;
      }

      if (connection === 'close') {
        const code      = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === 401;
        logger.info({ code }, '[baileys] disconnected');

        baileysState  = { qr: null, status: 'DISCONNECTED', phone: '' };
        baileysSocket = null;
        isConnecting  = false;
        try { emitNewMessage({ provider: 'baileys', type: 'status', ...baileysState }); } catch (_) {}

        if (loggedOut || code === 405) {
          await clearMongoAuthState().catch((e) => logger.error({ err: e }, '[baileys] clearMongoAuthState error'));
          reconnectCount = 0;
          logger.info({ code }, '[baileys] credentials cleared. Click Connect for a fresh QR.');
        } else {
          reconnectCount++;
          if (reconnectCount <= MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(5000 * reconnectCount, 25000);
            logger.info({ delay, attempt: reconnectCount, max: MAX_RECONNECT_ATTEMPTS }, '[baileys] reconnecting...');
            reconnectTimer = setTimeout(() => connect().catch((e) => logger.error({ err: e }, '[baileys] reconnect error')), delay);
          } else {
            logger.info('[baileys] max reconnect attempts reached. Manual reconnect required.');
            reconnectCount = 0;
          }
        }
      }
    });

    sock.ev.on('creds.update', () => saveCreds().catch((e) => logger.error({ err: e }, '[baileys] saveCreds error')));

    // Visibility only — Baileys persists LID<->PN mappings and contacts
    // itself (via the auth-state keys store passed into makeWASocket), so
    // no app-level storage is required here. These just confirm sync is
    // actually happening.
    sock.ev.on('contacts.upsert', (contacts) => {
      logger.info({ count: contacts?.length }, '[baileys] contacts.upsert');
    });
    sock.ev.on('messaging-history.set', ({ contacts, chats, isLatest }) => {
      logger.info(
        { contacts: contacts?.length || 0, chats: chats?.length || 0, isLatest },
        '[baileys] messaging-history.set'
      );
    });
    sock.ev.on('lid-mapping.update', (mapping) => {
      logger.info({ mapping }, '[baileys] lid-mapping.update');
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      logger.info({ type, count: messages?.length }, '[baileys] messages.upsert');
      for (const msg of messages) {
        try {
          if (msg.key?.fromMe) continue;
          const jid = msg.key?.remoteJid || '';
          if (!jid) continue;
          const normalized = await normalizeBaileysMessage(sock, msg);
          emitIncoming(normalized);
        } catch (err) {
          logger.error({ err: err.message }, '[baileys] normalizeBaileysMessage error');
        }
      }
    });

    // Delivery / read receipts for messages we sent
    sock.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates) {
        const statusCode = update?.status;
        if (statusCode == null || !key?.id) continue;
        const status = STATUS_MAP[statusCode];
        if (!status) continue;
        for (const fn of statusListeners) {
          try { fn({ id: key.id, status }); } catch (err) { logger.error({ err }, '[baileys] status listener error'); }
        }
      }
    });

  } catch (err) {
    isConnecting = false;
    logger.error({ err: err.message }, '[baileys] connect() error');
    baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
    try { emitNewMessage({ provider: 'baileys', type: 'status', ...baileysState }); } catch (_) {}
    throw err;
  }
}

async function disconnect() {
  reconnectCount = 0;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  killSocket();
  await clearMongoAuthState().catch((e) => logger.error({ err: e }, '[baileys] clearMongoAuthState error'));
  baileysState = { qr: null, status: 'DISCONNECTED', phone: '' };
  isConnecting = false;
  try { emitNewMessage({ provider: 'baileys', type: 'status', ...baileysState }); } catch (_) {}
  logger.info('[baileys] disconnected and credentials cleared.');
}

async function sendText({ to, body }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected — scan QR first.');
  }
  return baileysSocket.sendMessage(formatJid(to), { text: body });
}

async function sendImage({ to, imageUrl, caption = '' }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected — scan QR first.');
  }
  return baileysSocket.sendMessage(formatJid(to), { image: { url: imageUrl }, caption });
}

async function sendMedia({ to, mediaUrl, type, caption = '', fileName = '', mimeType = '' }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected — scan QR first.');
  }
  const jid = formatJid(to);
  const kind = String(type || '').toUpperCase();

  if (kind === 'IMAGE') {
    return baileysSocket.sendMessage(jid, { image: { url: mediaUrl }, caption });
  }
  if (kind === 'VIDEO') {
    return baileysSocket.sendMessage(jid, { video: { url: mediaUrl }, caption });
  }
  if (kind === 'AUDIO') {
    return baileysSocket.sendMessage(jid, { audio: { url: mediaUrl }, mimetype: mimeType || 'audio/mp4', ptt: false });
  }
  if (kind === 'DOCUMENT') {
    return baileysSocket.sendMessage(jid, {
      document: { url: mediaUrl },
      mimetype: mimeType || 'application/octet-stream',
      fileName: fileName || 'file',
      caption,
    });
  }
  throw new Error(`Unsupported media type "${type}"`);
}

async function sendTyping({ to, isTyping = true }) {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') return;
  try {
    await baileysSocket.sendPresenceUpdate(isTyping ? 'composing' : 'paused', formatJid(to));
  } catch (_) {}
}

async function getGroups() {
  if (!baileysSocket || baileysState.status !== 'CONNECTED') {
    throw new Error('Baileys not connected — scan QR first.');
  }
  const groups = await baileysSocket.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({
    id:   g.id,
    name: g.subject || g.id,
    size: g.participants?.length || 0,
  }));
}

async function autoConnectIfCredentialsExist() {
  try {
    const { state } = await useMongoAuthState();
    const hasCreds = state?.creds?.me || state?.creds?.noiseKey;
    if (hasCreds) {
      logger.info('[baileys] Saved credentials found — auto-connecting on boot…');
      await connect();
    } else {
      logger.info('[baileys] No saved credentials — waiting for manual QR scan.');
    }
  } catch (err) {
    logger.error({ err: err.message }, '[baileys] autoConnect error');
  }
}

module.exports = {
  connect,
  disconnect,
  sendText,
  sendImage,
  sendMedia,
  sendTyping,
  getGroups,
  getStatus,
  onIncomingMessage,
  onMessageStatus,
  autoConnectIfCredentialsExist,
};
