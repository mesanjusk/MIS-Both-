const sanjusk = require('./sanjuskApiService');
const sanjuskConversation = require('./sanjuskConversationService');
const Message = require('../repositories/Message');
const {
  processWhatsAppAttendanceCommand,
  processWhatsAppAttendanceButtonTap,
} = require('./whatsappAttendanceService');
const logger = require('../utils/logger');

const DEFAULT_POLL_INTERVAL_MS = 15 * 1000;
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

let timer = null;
let running = false;

const normalizeRow = (row = {}) => {
  const direction = String(row.direction || '').toLowerCase();
  const fromMe = row.fromMe === true || row.from_me === true || direction === 'outgoing';

  return {
    id: String(row.id || row._id || row.messageId || row.wamid || '').trim(),
    from: String(row.from || row.sender || row.phone || row.waId || row.wa_id || '').trim(),
    to: String(row.to || row.recipient || '').trim(),
    body: String(row.text || row.body || row.message || row.content || '').trim(),
    timestamp: row.timestamp || row.createdAt || row.created_at || row.time || null,
    status: String(row.status || 'received'),
    type: String(row.type || row.messageType || row.message_type || 'text'),
    direction: fromMe ? 'outgoing' : (direction || 'incoming'),
  };
};

const sendAttendanceReply = async ({ to, body }) => {
  const phone = String(to || '').replace(/\D/g, '');
  const text = String(body || '').trim();
  if (!phone || !text) return;
  await sanjusk.sendText({ phone, text, requireEnabled: false });
};

async function processRows(rows = [], { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  let handled = 0;

  for (const rawRow of rows) {
    const row = normalizeRow(rawRow);
    if (row.direction !== 'incoming') continue;
    if (!row.id || !row.from || !row.body || !row.timestamp) continue;

    const timestamp = new Date(row.timestamp);
    if (Number.isNaN(timestamp.getTime())) continue;

    const ageMs = Date.now() - timestamp.getTime();
    if (ageMs < -60 * 1000 || ageMs > maxAgeMs) continue;

    try {
      const existing = await Message.exists({ messageId: row.id });
      if (existing) continue;

      const payload = {
        from: row.from,
        message: row.body,
        text: row.body,
        messageId: row.id,
        timestamp,
      };

      const normalizedCommand = row.body.trim().toLowerCase();
      const result = normalizedCommand === 'start' || normalizedCommand === 'hi'
        ? await processWhatsAppAttendanceButtonTap({
            payload: {
              ...payload,
              replyId: 'attn:mark:start',
            },
            sendText: sendAttendanceReply,
          })
        : await processWhatsAppAttendanceCommand({
            payload,
            sendText: sendAttendanceReply,
          });

      if (!result?.handled) continue;

      await Message.findOneAndUpdate(
        { messageId: row.id },
        {
          $setOnInsert: {
            fromMe: false,
            from: row.from,
            to: row.to,
            message: row.body,
            body: row.body,
            text: row.body,
            timestamp,
            time: timestamp,
            status: row.status,
            direction: 'incoming',
            messageId: row.id,
            type: row.type,
            source: 'SANJUSK_BACKGROUND_ATTENDANCE',
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );

      handled += 1;
      logger.info(
        { messageId: row.id, from: row.from, command: normalizedCommand, success: result?.success !== false },
        '[sanjusk-attendance-poller] attendance command handled'
      );
    } catch (error) {
      logger.error(
        { err: error?.message || error, messageId: row.id, from: row.from },
        '[sanjusk-attendance-poller] failed to process message'
      );
    }
  }

  return handled;
}

async function pollOnce() {
  if (running) return 0;
  running = true;

  try {
    const { rows } = await sanjuskConversation.getRecentMessages({ limit: 100 });
    const handled = await processRows(rows);
    if (handled) logger.info({ handled }, '[sanjusk-attendance-poller] poll completed');
    return handled;
  } catch (error) {
    logger.error({ err: error?.message || error }, '[sanjusk-attendance-poller] poll failed');
    return 0;
  } finally {
    running = false;
  }
}

function initSanjuskAttendancePoller({ intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  if (timer) return timer;

  // Run immediately after startup so a fresh command sent during a deploy is
  // not forced to wait for the first interval tick.
  pollOnce();

  timer = setInterval(pollOnce, intervalMs);
  if (timer.unref) timer.unref();

  logger.info({ intervalMs }, '[sanjusk-attendance-poller] started');
  return timer;
}

function stopSanjuskAttendancePoller() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}

module.exports = {
  initSanjuskAttendancePoller,
  stopSanjuskAttendancePoller,
  pollOnce,
  processRows,
  normalizeRow,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_MAX_AGE_MS,
};
