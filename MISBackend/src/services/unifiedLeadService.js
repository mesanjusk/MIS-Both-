
const crypto = require('crypto');
const Message = require('../repositories/Message');
const CallLogs = require('../repositories/callLogs');
const SocialAccount = require('../repositories/SocialAccount');
const { AppSetting } = require('../repositories/appSetting');
const { graphGet } = require('./social/providers/metaGraphClient');
const { decryptToken } = require('./social/socialTokenCrypto');
const sanjuskConversation = require('./sanjuskConversationService');
const { normalizePhone, groupLeadEvents, explicitlySharedPhone } = require('./leadIdentityService');
const logger = require('../utils/logger');

const LINK_SETTING = 'unified_leads_instagram_phone_links';
const MAX_ROWS = 7500;
const MAX_IG_ACCOUNTS = 5;
const MAX_CONVERSATIONS_PER_ACCOUNT = 100;
const MAX_MESSAGES_PER_CONVERSATION = 50;

function chooseTimestamp(row) {
  return row.timestamp || row.time || row.createdAt || row.updatedAt ||
    (typeof row._id?.getTimestamp === 'function' ? row._id.getTimestamp() : null);
}

function incomingMessage(row) {
  return row.fromMe !== true && row.direction !== 'outgoing' && row.direction !== 'sent';
}

function messageToEvent(row) {
  if (!incomingMessage(row)) return null;
  const source = row.source === 'INSTAGRAM_DM' ? 'instagram' :
    row.source === 'LEADS_CALL_IMPORT' ? 'call' : 'whatsapp';
  const isInstagram = source === 'instagram';
  return {
    id: source + ':' + (row.messageId || row._id || row.id || ''),
    source,
    phone: isInstagram ? explicitlySharedPhone(row.message || row.body) : (source === 'call' ? row.from : row.from || row.wa_id),
    instagramId: isInstagram ? row.instagramUserId : '',
    instagramHandle: isInstagram ? row.instagramHandle : '',
    name: row.contactName || '',
    at: chooseTimestamp(row),
    detail: source === 'call'
      ? (row.message || 'Phone call')
      : (row.body || row.message || row.text || row.caption || (row.type ? '[' + row.type + ']' : 'Message')),
  };
}

async function collectLeads() {
  const [messages, calls, links] = await Promise.all([
    Message.find({}).sort({ _id: -1 }).limit(MAX_ROWS).lean(),
    CallLogs.find({}).limit(MAX_ROWS).lean(),
    AppSetting.getSetting(LINK_SETTING, {}),
  ]);

  const events = messages.map(messageToEvent).filter(Boolean);
  const importedNumbers = new Set(events.filter(e => e.source === 'call').map(e => normalizePhone(e.phone)));

  // Historical call records saved through the older Call Logs form have a
  // unique phone, not one row per call. Do not double count an imported call.
  for (const c of calls) {
    const phone = normalizePhone(c.Mobile_number);
    if (!phone || importedNumbers.has(phone)) continue;
    events.push({
      id: 'call:legacy:' + (c.CallLog_uuid || c._id),
      source: 'call', phone, name: c.Name, at: chooseTimestamp(c),
      detail: [c.Type, c.Status, c.Duration != null ? c.Duration + 's' : ''].filter(Boolean).join(' · '),
    });
  }

  let whatsappStatus = 'ready';
  try {
    // Same rate-limited, cached recent tail as Home Inbox, not a second
    // unbounded provider-history crawl on every Leads request.
    const cached = await sanjuskConversation.getRecentMessages({ limit: 100 });
    for (const row of (cached.rows || [])) {
      if (row.direction === 'outgoing' || row.fromMe || row.isOutbound) continue;
      events.push({
        id: 'whatsapp:' + (row.id || row.messageId || row.wamid || [row.from, row.timestamp, row.text].join(':')),
        source: 'whatsapp', phone: row.from || row.sender || row.wa_id,
        at: chooseTimestamp(row), detail: row.text || row.body || row.message || row.caption || '',
      });
    }
    if (cached.degraded) whatsappStatus = 'cached';
  } catch (error) {
    logger.warn({ message: error.message }, '[leads] WhatsApp tail unavailable; returning stored history');
    whatsappStatus = 'stored_only';
  }

  const activeIg = await SocialAccount.find({ platform: 'instagram', status: 'CONNECTED' })
    .select('platformAccountId scopes').lean();
  const instagramStatus = activeIg.length === 0
    ? 'not_connected'
    : activeIg.some(a => (a.scopes || []).includes('instagram_manage_messages'))
      ? 'connected'
      : 'needs_messaging_permission';

  const leads = groupLeadEvents(events, links && typeof links === 'object' ? links : {});
  return {
    leads,
    total: leads.length,
    status: { whatsapp: whatsappStatus, instagram: instagramStatus, call: 'stored' },
    limits: { storedMessages: MAX_ROWS, storedCalls: MAX_ROWS, instagramSyncConversations: MAX_CONVERSATIONS_PER_ACCOUNT },
  };
}

async function syncInstagram() {
  const accounts = await SocialAccount.find({ platform: 'instagram', status: 'CONNECTED' })
    .select('+accessTokenEncrypted').limit(MAX_IG_ACCOUNTS).lean();
  if (!accounts.length) return { status: 'not_connected', imported: 0 };
  const permitted = accounts.filter(a => (a.scopes || []).includes('instagram_manage_messages'));
  if (!permitted.length) return { status: 'needs_messaging_permission', imported: 0 };
  let imported = 0;
  let inspected = 0;
  let truncated = false;
  const errors = [];

  for (const account of permitted) {
    try {
      const token = decryptToken(account.accessTokenEncrypted);
      if (!token) throw new Error('Instagram token unavailable; reconnect account');
      let after = null;
      let seenConversations = 0;
      do {
        const page = await graphGet(`${account.platformAccountId}/conversations`,
          { platform: 'instagram', fields: 'id,participants{id,username},updated_time', limit: 25, ...(after ? { after } : {}) }, token);
        for (const conversation of (page.data || [])) {
          if (seenConversations >= MAX_CONVERSATIONS_PER_ACCOUNT) { truncated = true; break; }
          seenConversations += 1;
          inspected += 1;
          const members = conversation.participants?.data || [];
          const external = members.find(p => String(p.id) !== String(account.platformAccountId));
          const messages = await graphGet(`${conversation.id}/messages`,
            { fields: 'id,message,from{id,username},created_time', limit: MAX_MESSAGES_PER_CONVERSATION }, token);
          if (messages.paging?.next) truncated = true;
          for (const msg of (messages.data || [])) {
            const sender = msg.from || external;
            const instagramId = String(sender?.id || external?.id || '');
            if (!instagramId || instagramId === String(account.platformAccountId) || !msg.id) continue;
            const stamp = msg.created_time ? new Date(msg.created_time) : new Date();
            await Message.findOneAndUpdate(
              { messageId: 'instagram:' + msg.id },
              { $setOnInsert: {
                messageId: 'instagram:' + msg.id, source: 'INSTAGRAM_DM',
                instagramAccountId: String(account.platformAccountId),
                instagramUserId: instagramId,
                instagramHandle: String(sender?.username || external?.username || ''),
                message: String(msg.message || '').slice(0,4000),
                fromMe: false, direction: 'incoming', type: 'text',
                timestamp: Number.isNaN(stamp.getTime()) ? new Date() : stamp,
              } },
              { upsert: true, setDefaultsOnInsert: true }
            );
            imported += 1;
          }
        }
        after = page.paging?.next ? (page.paging?.cursors?.after || null) : null;
        if (after && seenConversations >= MAX_CONVERSATIONS_PER_ACCOUNT) truncated = true;
      } while (after && seenConversations < MAX_CONVERSATIONS_PER_ACCOUNT);
    } catch (error) {
      errors.push(error.message || 'Instagram API unavailable');
      logger.warn({ message: error.message }, '[leads] Instagram DM sync error');
    }
  }
  return { status: errors.length ? (imported ? 'partial' : 'error') : (truncated ? 'partial' : 'ready'), imported, inspected, truncated, errors };
}

async function importCallLogs(logs, day) {
  const list = Array.isArray(logs) ? logs.slice(0, 200) : [];
  let imported = 0;
  for (const [index, call] of list.entries()) {
    const phone = normalizePhone(call.callerId || call.Mobile_number || call.phone);
    if (!phone) continue;
    const name = String(call.cachedName || call.Name || '').slice(0,120);
    const type = String(call.type || call.Type || 'call').slice(0,30);
    const duration = Number(call.duration || call.Duration || 0);
    const timestamp = call.timestamp || call.callTime || call.startTime || call.date || day;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) continue;
    const providerId = String(call.id || call._id || call.uuid || '').slice(0,80);
    const stableInput = JSON.stringify([day, providerId || index, phone, type, duration, date.toISOString()]);
    const id = 'leadcall:' + crypto.createHash('sha256').update(stableInput).digest('hex');
    await Message.findOneAndUpdate({ messageId: id }, { $setOnInsert: {
      messageId: id, source: 'LEADS_CALL_IMPORT', from: phone,
      contactName: name, fromMe: false, direction: 'incoming',
      type: 'call', message: type + ' call · ' + (Number.isFinite(duration) ? duration : 0) + 's',
      timestamp: date,
    } }, { upsert: true, setDefaultsOnInsert: true });
    imported += 1;
  }
  return { imported };
}

module.exports = { collectLeads, syncInstagram, importCallLogs, LINK_SETTING };
