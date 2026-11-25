const { createHash } = require('node:crypto');
const { parseAddressList } = require('email-addresses');
const GmailAccount = require('../repositories/GmailAccount');
const EmailHistory = require('../repositories/EmailHistory');
const { getPrintSentClient } = require('./gmailOAuthService');
const { getDriveMetadataClient } = require('./googleDriveOAuthService');
const { makeThumbnail } = require('./printSentThumbnail');
const { findPrintDriveLinks } = require('./printSentDriveLinks');
const logger = require('../utils/logger');
const { recentPrintDates, printDateRange } = require('../utils/printSentDates');

const PRINT_SOURCE = 'print_sent';
const MINUTE = 60_000;
const SYNC_VERSION = 3;
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

function* messageParts(root) {
  const queue = [root];
  while (queue.length) {
    const part = queue.pop();
    if (!part || part.mimeType === 'message/rfc822') continue;
    yield part;
    for (const child of [...(part.parts || [])].reverse()) queue.push(child);
  }
}

function attachmentParts(root) {
  return [...messageParts(root)].filter((part) => {
    const disposition = (part.headers || []).find((header) => String(header.name).toLowerCase() === 'content-disposition');
    return part.filename && !/^inline\b/i.test(String(disposition?.value || '').trim());
  });
}

const rowId = (account, messageId, email) => `print-sent-${createHash('sha256').update(`${account._id}:${messageId}:${email}`).digest('hex')}`;

async function saveMessage(gmail, account, messageId, lookupDriveName) {
  const { data: message } = await gmail.users.messages.get({
    userId: 'me', id: messageId, format: 'full', fields: 'labelIds,internalDate,payload',
  }, REQUEST_OPTIONS);
  if (!message?.labelIds?.includes('SENT') || message.labelIds.includes('TRASH')) return;
  const matches = sentRecipients(message.payload?.headers, account.printRecipients);
  if (!matches.length) return;
  const identifiers = matches.map((recipient) => rowId(account, messageId, recipient.email));
  const existing = new Set(await EmailHistory.distinct('emailId', { emailId: { $in: identifiers } }));
  const needsInsert = identifiers.some((id) => !existing.has(id));
  const links = await findPrintDriveLinks(gmail, messageId, messageParts(message.payload), REQUEST_OPTIONS);
  if (!needsInsert && !links.length) return;

  const driveFiles = await Promise.all(links.map(async ({ id, resourceKey, name }, index) => ({
    originalName: name || (index < 10 ? await lookupDriveName(id, resourceKey) : '') || 'Google Drive file',
    storageMethod: 'google_drive',
    driveFileId: id,
  })));
  const attachments = [];
  const previewDeadline = Date.now() + 15_000;
  for (const part of needsInsert ? attachmentParts(message.payload) : []) {
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
    if (existing.has(emailId)) {
      // Keep the existing attachment positions and receipt flags. An atomic
      // append also makes retries safe when the same Drive link is seen again.
      for (const driveFile of driveFiles) {
        await EmailHistory.updateOne(
          { emailId, source: PRINT_SOURCE, 'attachments.driveFileId': { $ne: driveFile.driveFileId } },
          { $push: { attachments: driveFile } },
        );
      }
      continue;
    }
    try {
      await EmailHistory.updateOne({ emailId }, { $setOnInsert: {
        source: PRINT_SOURCE, fromGmailAccountId: account.accountId, toEmail: recipient.email,
        toName: recipient.name, gmailMessageId: messageId, sentAt, status: 'sent', attachments: [...attachments, ...driveFiles],
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
  let importingHistory = false;
  try {
    const gmail = getPrintSentClient(account.printSentToken);
    let driveClient;
    const lookupDriveName = async (fileId, resourceKey) => {
      try {
        driveClient ||= getDriveMetadataClient().catch(() => null);
        const drive = await driveClient;
        if (!drive) return '';
        const headers = resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${fileId}/${resourceKey}` } : {};
        const { data } = await drive.files.get({ fileId, fields: 'name', supportsAllDrives: true },
          { headers, timeout: 5000, retry: false });
        return String(data?.name || '').trim().slice(0, 500);
      } catch { return ''; }
    };
    // Backfill the seven visible days when parsing changes, and keep the
    // search window fixed until the last page of each Gmail query.
    const cursor = account.printSentSyncVersion === SYNC_VERSION ? account.printSentCursor : null;
    const continuing = cursor && account.printSentPageToken && account.printSentWindowEnd;
    const earliest = printDateRange(recentPrintDates(now).at(-1)).$gte.getTime();
    const start = (cursor?.getTime() ?? earliest) - SYNC_OVERLAP;
    const end = continuing ? account.printSentWindowEnd : new Date(Math.floor(now.getTime() / 1000) * 1000);
    const query = `after:${Math.floor(start / 1000)} before:${Math.floor(end.getTime() / 1000)}`;
    const syncPage = async (q, pageToken) => {
      const { data } = await gmail.users.messages.list({
        userId: 'me', labelIds: ['SENT'], q, maxResults: 10, pageToken,
      }, REQUEST_OPTIONS);
      for (const { id } of data.messages || []) {
        try {
          await saveMessage(gmail, account, id, lookupDriveName);
        } catch (error) {
          if (Number(error.response?.status || error.code) !== 404) throw error;
        }
      }
      return data.nextPageToken || '';
    };
    const nextPage = await syncPage(query, continuing ? account.printSentPageToken : undefined);
    await GmailAccount.updateOne(activeLease, { $set: {
      printSentLastSync: new Date(), printSentError: '', printSentPageToken: nextPage,
      printSentSyncVersion: SYNC_VERSION,
      printSentWindowEnd: nextPage ? end : null,
      printSentCursor: nextPage ? new Date(start + SYNC_OVERLAP) : end,
    } });
    if (!nextPage && !account.printSentHistoryComplete && await GmailAccount.exists(activeLease)) {
      // Import an older page after the current-mail scan, so older mail cannot
      // delay routine sync. Keep its cutoff fixed across invocations.
      const before = account.printSentHistoryBefore || new Date(Math.min(earliest, start + SYNC_OVERLAP));
      const historicalQuery = `before:${Math.floor(before.getTime() / 1000)}`;
      importingHistory = true;
      const historyPage = await syncPage(historicalQuery, account.printSentHistoryPageToken || undefined);
      await GmailAccount.updateOne(activeLease, { $set: {
        printSentHistoryBefore: before,
        printSentHistoryPageToken: historyPage,
        printSentHistoryComplete: !historyPage,
      } });
    }
    return true;
  } catch (error) {
    const status = Number(error.response?.status || error.code);
    const revoked = error.response?.data?.error === 'invalid_grant' || status === 401;
    const message = revoked ? 'Google access expired. Reconnect Gmail.' : 'Sync failed. Check Google permissions or try again shortly.';
    await GmailAccount.updateOne(activeLease, { $set: {
      printSentError: message,
      ...(revoked ? { printSentEnabled: false } : {}),
      ...(status === 400 && !importingHistory && account.printSentPageToken ? { printSentPageToken: '', printSentWindowEnd: null } : {}),
      ...(status === 400 && importingHistory && account.printSentHistoryPageToken ? { printSentHistoryPageToken: '' } : {}),
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
