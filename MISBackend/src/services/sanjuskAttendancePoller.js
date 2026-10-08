const sanjusk = require('./sanjuskApiService');
const Message = require('../repositories/Message');
const {
  processWhatsAppAttendanceCommand,
  processWhatsAppAttendanceButtonTap,
} = require('./whatsappAttendanceService');
const logger = require('../utils/logger');

const DEFAULT_POLL_INTERVAL_MS = 30 * 1000;
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_PAGES_PER_POLL = 3;

let timer = null;
let running = false;
let pollCursor = null;
let rateLimitedUntil = 0;

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
  if (Date.now() < rateLimitedUntil) return 0;
  running = true;

  try {
    // Attendance only needs fresh inbound commands. Do not warm the full Inbox
    // history here: walking thousands of old messages can exhaust the provider
    // rate limit before we ever reach a new START/HI message.
    let since = pollCursor || new Date(Date.now() - DEFAULT_MAX_AGE_MS).toISOString();
    let handled = 0;

    for (let page = 0; page < MAX_PAGES_PER_POLL; page += 1) {
      const payload = await sanjusk.listMessages({
        since,
        limit: 200,
        requireEnabled: false,
      });
      const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);

      handled += await processRows(rows);

      const nextSince = payload?.nextSince;
      const lastRow = rows[rows.length - 1];
      const lastStamp = lastRow?.createdAt || lastRow?.timestamp || lastRow?.created_at || lastRow?.time;

      if (nextSince) since = nextSince;
      else if (lastStamp) since = new Date(lastStamp).toISOString();

      pollCursor = since;

      if (!payload?.hasMore || !rows.length) break;
    }

    rateLimitedUntil = 0;
    if (handled) logger.info({ handled }, '[sanjusk-attendance-poller] poll completed');
    return handled;
  } catch (error) {
    const isRateLimited = Number(error?.statusCode || error?.status) === 429 || /rate limit/i.test(String(error?.message || ''));
    if (isRateLimited) {
      rateLimitedUntil = Date.now() + 2 * 60 * 1000;
      logger.warn(
        { retryAfterMs: 2 * 60 * 1000 },
        '[sanjusk-attendance-poller] provider rate limited; backing off'
      );
    } else {
      logger.error({ err: error?.message || error }, '[sanjusk-attendance-poller] poll failed');
    }
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
  pollCursor = null;
  rateLimitedUntil = 0;
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
