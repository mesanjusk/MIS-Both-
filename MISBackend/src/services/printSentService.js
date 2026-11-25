const { createHash } = require('node:crypto');
const { parseAddressList } = require('email-addresses');
const GmailAccount = require('../repositories/GmailAccount');
const EmailHistory = require('../repositories/EmailHistory');
const { getPrintSentClient } = require('./gmailOAuthService');
const { makeThumbnail } = require('./printSentThumbnail');
const logger = require('../utils/logger');
const { recentPrintDates, printDateRange } = require('../utils/printSentDates');

const PRINT_SOURCE = 'print_sent';
const MINUTE = 60_000;
const SYNC_VERSION = 2;
const SYNC_OVERLAP = 2 * MINUTE;
const SYNCABLE_ACCOUNTS = { printSentEnabled: true, printSentToken: { $exists: true } };
const REQUEST_OPTIONS = { timeout: 10_000, retry: false };
const ADDRESS = /^[a-z0-9._%+\-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i;
let sweepRunning = false;

function normalizeRecipients(entries) {
  if (!Array.isArray(entries) || entries.length > 25) throw new Error('Enter up to 25 printer email addresses.');
  const result = new Map();
  for (const entry of entries) {
    const email = String(entry?.email || '').trim().toLowerCase();
    if (email.length > 254 || !ADDRESS.test(email)) throw new Error('Enter a valid printer email address on each line.');
    result.set(email, { email, name: String(entry?.name || '').trim().slice(0, 120) });
  }
  return [...result.values()];
}

function sentRecipients(headers, recipients = []) {
  const names = new Map(recipients.map((entry) => [entry.email, entry.name]));
  const matches = new Map();
  for (const header of headers || []) {
    if (!['to', 'cc', 'bcc'].includes(String(header.name).toLowerCase())) continue;
    const addresses = parseAddressList({ input: String(header.value || ''), flatten: true }) || [];
    for (const address of addresses) {
      const email = String(address.address || '').toLowerCase();
      if (!email || email.length > 254) continue;
      const name = names.get(email) || address.name || matches.get(email)?.name || email;
      matches.set(email, { email, name: String(name).slice(0, 254) });
    }
  }
  return [...matches.values()];
}

function attachmentParts(root) {
  const queue = [root];
  const files = [];
  while (queue.length) {
    const part = queue.pop();
    if (!part || part.mimeType === 'message/rfc822') continue;
    const disposition = (part.headers || []).find((header) => String(header.name).toLowerCase() === 'content-disposition');
    if (part.filename && !/^inline\b/i.test(String(disposition?.value || '').trim())) files.push(part);
    for (const child of [...(part.parts || [])].reverse()) queue.push(child);
  }
  return files;
}

const rowId = (account, messageId, email) => `print-sent-${createHash('sha256').update(`${account._id}:${messageId}:${email}`).digest('hex')}`;

async function saveMessage(gmail, account, messageId) {
  const { data: message } = await gmail.users.messages.get({
    userId: 'me', id: messageId, format: 'full', fields: 'labelIds,internalDate,payload',
  }, REQUEST_OPTIONS);
  if (!message?.labelIds?.includes('SENT') || message.labelIds.includes('TRASH')) return;
  const matches = sentRecipients(message.payload?.headers, account.printRecipients);
  if (!matches.length) return;
  const files = attachmentParts(message.payload);

  const identifiers = matches.map((recipient) => rowId(account, messageId, recipient.email));
  const existing = new Set(await EmailHistory.distinct('emailId', { emailId: { $in: identifiers } }));
  if (identifiers.every((id) => existing.has(id))) return;

  const attachments = [];
  const previewDeadline = Date.now() + 15_000;
  for (const part of files) {
    attachments.push({
      originalName: String(part.filename).slice(0, 500),
      mimeType: String(part.mimeType || '').slice(0, 120),
      thumbnail: Date.now() < previewDeadline ? await makeThumbnail(gmail, messageId, part, REQUEST_OPTIONS) : '',
    });
  }
  const timestamp = Number(message.internalDate);
  const sentAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date();
  const stillEnabled = await GmailAccount.exists({ _id: account._id, printSentLease: account.printSentLease, printSentEnabled: true });
  if (!stillEnabled) return;
  for (const [index, recipient] of matches.entries()) {
    const emailId = identifiers[index];
    if (existing.has(emailId)) continue;
    try {
      await EmailHistory.updateOne({ emailId }, { $setOnInsert: {
        source: PRINT_SOURCE, fromGmailAccountId: account.accountId, toEmail: recipient.email,
        toName: recipient.name, gmailMessageId: messageId, sentAt, status: 'sent', attachments,
      } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
}

async function syncPrintSentAccount(accountId) {
  const now = new Date();
  const lease = new Date(now.getTime() + 10 * MINUTE);
  const account = await GmailAccount.findOneAndUpdate({
    _id: accountId, ...SYNCABLE_ACCOUNTS,
    $or: [{ printSentLease: null }, { printSentLease: { $lt: now } }],
  }, { $set: { printSentLease: lease } }, { new: true }).select('+printSentToken').lean();
  if (!account) return false;
  const activeLease = { _id: account._id, printSentLease: lease };
  try {
    const gmail = getPrintSentClient(account.printSentToken);
    // Page tokens are tied to their original query. Start a fresh seven-day backfill
    // when the filter changes, then keep the window fixed until all pages are read.
    const cursor = account.printSentSyncVersion === SYNC_VERSION ? account.printSentCursor : null;
    const continuing = cursor && account.printSentPageToken && account.printSentWindowEnd;
    const earliest = printDateRange(recentPrintDates(now).at(-1)).$gte.getTime();
    const start = (continuing ? cursor.getTime() : Math.max(cursor?.getTime() ?? earliest, earliest)) - SYNC_OVERLAP;
    const end = continuing ? account.printSentWindowEnd : new Date(Math.floor(now.getTime() / 1000) * 1000);
    const query = `after:${Math.floor(start / 1000)} before:${Math.floor(end.getTime() / 1000)}`;
    const { data } = await gmail.users.messages.list({
      userId: 'me', labelIds: ['SENT'], q: query, maxResults: 10,
      pageToken: continuing ? account.printSentPageToken : undefined,
    }, REQUEST_OPTIONS);
    for (const { id } of data.messages || []) {
      try {
        await saveMessage(gmail, account, id);
      } catch (error) {
        if (Number(error.response?.status || error.code) !== 404) throw error;
      }
    }
    await GmailAccount.updateOne(activeLease, { $set: {
      printSentLastSync: new Date(), printSentError: '', printSentPageToken: data.nextPageToken || '',
      printSentSyncVersion: SYNC_VERSION,
      printSentWindowEnd: data.nextPageToken ? end : null,
      printSentCursor: data.nextPageToken ? new Date(start + SYNC_OVERLAP) : end,
    } });
    return true;
  } catch (error) {
    const status = Number(error.response?.status || error.code);
    const revoked = error.response?.data?.error === 'invalid_grant' || status === 401;
    const message = revoked ? 'Google access expired. Reconnect Gmail.' : 'Sync failed. Check Google permissions or try again shortly.';
    await GmailAccount.updateOne(activeLease, { $set: {
      printSentError: message,
      ...(revoked ? { printSentEnabled: false } : {}),
      ...(status === 400 && account.printSentPageToken ? { printSentPageToken: '', printSentWindowEnd: null } : {}),
    } });
    return false;
  } finally {
    await GmailAccount.updateOne(activeLease, { $set: { printSentLease: null } });
  }
}

async function sweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const accounts = await GmailAccount.find(SYNCABLE_ACCOUNTS)
      .select('_id').lean();
    for (const { _id } of accounts) await syncPrintSentAccount(_id);
  } catch (error) {
    logger.error({ code: error.code }, '[print-sent] scheduled sync failed');
  } finally {
    sweepRunning = false;
  }
}

function initPrintSentSync() {
  setInterval(sweep, MINUTE).unref();
  void sweep();
}

module.exports = { PRINT_SOURCE, SYNCABLE_ACCOUNTS, initPrintSentSync, syncPrintSentAccount, normalizeRecipients, sentRecipients, attachmentParts };
