/**
 * Baileys WhatsApp service for MIS project.
 *
 * Handles QR-based WhatsApp Web connection, sending text/image messages,
 * and auto-reconnect on server restart if credentials are saved in MongoDB.
 */

const { emitNewMessage } = require('../../socket');
const { useMongoAuthState, clearMongoAuthState } = require('./baileysAuthState');
const logger = require('../utils/logger');

const MAX_RECONNECT_ATTEMPTS = 5;

let baileysState   = { qr: null, status: 'DISCONNECTED', phone: '' };
let baileysSocket  = null;
let reconnectTimer = null;
let isConnecting   = false;
let reconnectCount = 0;

// Listeners registered by the controller layer for incoming messages
const incomingListeners = [];

// ── helpers ───────────────────────────────────────────────────────────────────

async function getWASocketAndVersion() {
  const mod = await import('@whiskeysockets/baileys');

  const makeWASocket = mod.default?.makeWASocket
    ?? mod.makeWASocket
    ?? mod.default
    ?? mod;

  const fetchLatestBaileysVersion = mod.fetchLatestBaileysVersion
    ?? mod.default?.fetchLatestBaileysVersion;

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

  return { makeWASocket, version };
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

function normalizeBaileysMessage(msg) {
  const jid         = msg.key?.remoteJid || '';
  const isGroup     = jid.endsWith('@g.us');
  const participant = msg.key?.participant || msg.participant || '';
  const senderJid   = isGroup ? participant : jid;
  const senderPhone = senderJid.split('@')[0];
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
  const isMedia = !!(m.imageMessage || m.videoMessage || m.documentMessage || m.audioMessage);
  return {
    id:          msg.key?.id || '',
    from:        senderPhone,
    groupId:     isGroup ? jid : '',
    isGroup,
    body:        body || (isMedia ? '[Media]' : ''),
    type:        isMedia ? 'media' : 'text',
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
    const { makeWASocket, version } = await getWASocketAndVersion();
    const pino   = (await import('pino')).default;
    const pinoLogger = pino({ level: 'silent' });

    const { state, saveCreds } = await useMongoAuthState();

    const sock = makeWASocket({
      version,
      logger: pinoLogger,
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: state.keys },
      browser: ['MIS App', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory:                false,
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

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      logger.info({ type, count: messages?.length }, '[baileys] messages.upsert');
      for (const msg of messages) {
        try {
          if (msg.key?.fromMe) continue;
          const jid = msg.key?.remoteJid || '';
          if (!jid) continue;
          emitIncoming(normalizeBaileysMessage(msg));
        } catch (err) {
          logger.error({ err: err.message }, '[baileys] normalizeBaileysMessage error');
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
  getGroups,
  getStatus,
  onIncomingMessage,
  autoConnectIfCredentialsExist,
};
