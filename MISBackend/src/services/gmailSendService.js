const { google }    = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { getAuthorizedGmailClient, selectBestAccount } = require('./gmailOAuthService');
const GmailAccount   = require('../repositories/GmailAccount');
const EmailHistory   = require('../repositories/EmailHistory');
const PurchaseOrder  = require('../repositories/purchaseOrder');
const VendorMaster   = require('../repositories/vendorMaster');
const Counter        = require('../repositories/counter');
const logger         = require('../utils/logger');

// Stay under Gmail 25MB MIME overhead — use Drive for files at or above this size
const LARGE_FILE_BYTES = 24 * 1024 * 1024;

/**
 * Parses the standard design filename convention:
 *   "CustomerName - SizexSize=Qty - ItemName.ext"
 *
 * Examples:
 *   "Sanju - 3x5=1 - star.pdf"   → { customer:"Sanju", size:"3x5", qty:1, item:"star" }
 *   "Ravi - 4x6=10 - flex.cdr"   → { customer:"Ravi",  size:"4x6", qty:10, item:"flex" }
 */
function parseFilename(filename) {
  const nameOnly = filename.replace(/\.[^.]+$/, '').trim();
  const parts    = nameOnly.split(/\s*-\s*/);

  if (parts.length < 3) return { parseSuccess: false };

  const parsedCustomer = parts[0].trim();
  const sizeQtyPart    = parts[1].trim();
  const parsedItem     = parts.slice(2).join(' - ').trim();

  if (!sizeQtyPart.includes('=')) return { parseSuccess: false, parsedCustomer };

  const eqIdx     = sizeQtyPart.lastIndexOf('=');
  const parsedSize = sizeQtyPart.slice(0, eqIdx).trim();
  const parsedQty  = parseInt(sizeQtyPart.slice(eqIdx + 1), 10);

  if (!Number.isFinite(parsedQty) || parsedQty <= 0) return { parseSuccess: false, parsedCustomer };

  return { parseSuccess: true, parsedCustomer, parsedSize, parsedQty, parsedItem };
}

function urlSafeBase64(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMime({ from, to, subject, bodyText, attachments }) {
  const boundary = `mis_${uuidv4().replace(/-/g, '')}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(bodyText || '').toString('base64'),
  ];

  for (const att of attachments) {
    const safeName = String(att.name || 'file').replace(/"/g, '');
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.mimeType || 'application/octet-stream'}`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${safeName}"`);
    lines.push('');
    lines.push(att.data);
  }

  lines.push(`--${boundary}--`);
  return urlSafeBase64(Buffer.from(lines.join('\r\n')));
}

async function uploadLargeFileToDrive(file) {
  const { getAuthorizedDriveClient } = require('./googleDriveOAuthService');
  const { Readable } = require('stream');

  const drive  = await getAuthorizedDriveClient();
  const stream = Readable.from(file.buffer);

  const meta = { name: file.originalname };
  if (process.env.GMAIL_DRIVE_FOLDER_ID) meta.parents = [process.env.GMAIL_DRIVE_FOLDER_ID];

  const created = await drive.files.create({
    requestBody: meta,
    media: { mimeType: file.mimetype, body: stream },
    fields: 'id',
  });

  const fileId = created.data.id;

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    driveFileId:        fileId,
    driveShareableLink: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
  };
}

async function nextPoNumber() {
  const counter = await Counter.findByIdAndUpdate(
    'purchase_order_number',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(counter?.seq || 1);
}

async function createAutoPO({ vendorUuid, vendorName, parsedItems, sentBy, emailId }) {
  const items = parsedItems
    .filter((p) => p.parseSuccess)
    .map((p) => ({
      itemName: [p.parsedItem, p.parsedSize ? `(${p.parsedSize})` : ''].filter(Boolean).join(' '),
      qty:      p.parsedQty,
      unit:     'Nos',
      rate:     1,
      amount:   1,
    }));

  if (!items.length) return null;

  return PurchaseOrder.create({
    PO_Number:  await nextPoNumber(),
    Vendor_uuid: vendorUuid,
    Vendor_name: vendorName,
    Items:       items,
    totalAmount: items.length,
    status:      'draft',
    notes:       `Auto-created from email dispatch. Ref: ${emailId}. Admin: please update actual pricing.`,
    createdBy:   sentBy,
  });
}

async function sendEmail({ preferredAccountId, toEmail, toName, vendorUuid, subject, bodyText, files, sentBy }) {
  const account = await selectBestAccount(preferredAccountId);
  const { client } = await getAuthorizedGmailClient(account.accountId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const directFiles      = [];
  const driveFiles       = [];
  const allAttachmentMeta = [];

  for (const file of files || []) {
    const parsed   = parseFilename(file.originalname);
    const baseMeta = { ...parsed, originalName: file.originalname, mimeType: file.mimetype, fileSize: file.size };

    if (file.size >= LARGE_FILE_BYTES) {
      try {
        const driveResult = await uploadLargeFileToDrive(file);
        const entry = { ...baseMeta, ...driveResult, storageMethod: 'google_drive' };
        driveFiles.push(entry);
        allAttachmentMeta.push(entry);
      } catch (err) {
        logger.warn({ err: err.message, file: file.originalname }, '[gmail] Drive upload failed for large file');
        allAttachmentMeta.push({ ...baseMeta, storageMethod: 'google_drive', driveShareableLink: '', driveFileId: '' });
      }
    } else {
      const entry = { ...baseMeta, storageMethod: 'gmail_attachment', data: file.buffer.toString('base64') };
      directFiles.push(entry);
      allAttachmentMeta.push(entry);
    }
  }

  let fullBody = bodyText || '';
  if (driveFiles.length) {
    fullBody += '\n\n--- Large File Download Links ---';
    driveFiles.forEach((f) => {
      fullBody += `\n${f.originalName}: ${f.driveShareableLink || '(upload failed)'}`;
    });
  }

  const raw = buildMime({
    from:        account.email,
    to:          toName ? `${toName} <${toEmail}>` : toEmail,
    subject,
    bodyText:    fullBody,
    attachments: directFiles.map((f) => ({ name: f.originalName, mimeType: f.mimeType, data: f.data })),
  });

  let gmailMessageId = '';
  let status         = 'sent';
  let lastError      = '';

  try {
    const res     = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    gmailMessageId = res.data.id || '';

    const today = new Date().toISOString().slice(0, 10);
    await GmailAccount.updateOne(
      { accountId: account.accountId },
      {
        $inc: { dailySentCount: 1 },
        $set: { dailySentDate: today, lastUsedAt: new Date(), isConnected: true, lastError: '' },
      }
    );
  } catch (err) {
    status    = 'failed';
    lastError = err.message;
    await GmailAccount.updateOne(
      { accountId: account.accountId },
      { $set: { lastError: err.message, lastErrorAt: new Date() } }
    );
    logger.error({ err: err.message, toEmail }, '[gmail] Send failed');
  }

  const normaliseAtt = (a) => ({
    originalName:       a.originalName || '',
    fileSize:           a.fileSize || 0,
    mimeType:           a.mimeType || '',
    storageMethod:      a.storageMethod || 'gmail_attachment',
    driveFileId:        a.driveFileId || '',
    driveShareableLink: a.driveShareableLink || '',
    parsedCustomer:     a.parsedCustomer || '',
    parsedSize:         a.parsedSize || '',
    parsedQty:          a.parsedQty || 0,
    parsedItem:         a.parsedItem || '',
    parseSuccess:       a.parseSuccess || false,
  });

  const emailRecord = await EmailHistory.create({
    fromGmailAccountId: account.accountId,
    fromEmail:          account.email,
    sentBy,
    toEmail,
    toName:             toName || '',
    vendorUuid:         vendorUuid || '',
    subject,
    bodyText:           fullBody,
    attachments:        allAttachmentMeta.map(normaliseAtt),
    status,
    gmailMessageId,
    lastError,
    sentAt: new Date(),
  });

  let po = null;
  if (vendorUuid && status === 'sent') {
    const vendor = await VendorMaster.findOne({ Vendor_uuid: vendorUuid }).lean();
    if (vendor) {
      try {
        po = await createAutoPO({
          vendorUuid:   vendor.Vendor_uuid,
          vendorName:   vendor.Vendor_name,
          parsedItems:  allAttachmentMeta,
          sentBy,
          emailId:      emailRecord.emailId,
        });
        if (po) {
          await EmailHistory.updateOne({ _id: emailRecord._id }, { $set: { poUuid: po.PO_uuid } });
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[gmail] Auto-PO creation skipped');
      }
    }
  }

  if (status === 'failed') {
    const err = new Error(lastError || 'Email send failed');
    err.emailRecord = emailRecord;
    throw err;
  }

  return { emailRecord, po };
}

module.exports = { sendEmail, parseFilename };
