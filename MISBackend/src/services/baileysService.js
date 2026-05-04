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

function formatJid(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  return clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
}

function normalizeBaileysMessage(msg) {
  const from = (msg.key.remoteJid || '').split('@')[0];
  const body =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption || '';
  return {
    id:        msg.key.id,
    from,
    body,
    type:      msg.message?.imageMessage ? 'image' : 'text',
    timestamp: msg.messageTimestamp,
    raw:       msg,
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
      // 'notify' = real-time incoming; 'append' = missed messages replayed on reconnect
      if (type !== 'notify' && type !== 'append') return;
      for (const msg of messages) {
        if (msg.key?.fromMe) continue;
        if (!msg.message) continue; // skip protocol/system messages with no content
        emitIncoming(normalizeBaileysMessage(msg));
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
  getStatus,
  onIncomingMessage,
  autoConnectIfCredentialsExist,
};
