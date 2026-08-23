/**
 * driveArchiveFolderService.js
 *
 * Helpers for the Drive archive tree the design flow writes into:
 *
 *   <DRIVE_ARCHIVE_FOLDER_ID>      e.g. "Daily Work / 1 Month"
 *     └── 04 April 2026            month folder
 *         └── 01.04.2026           date folder
 *             ├── Final
 *             └── Printing
 *                 └── 153          per-order folder (created here)
 *
 * Nothing in here changes how the tree is *read* (see DesignFiles.js
 * scan-archive) — it only resolves an existing path and creates the parts
 * that are missing, so a newly created order always has an empty folder
 * named after its order number waiting inside that day's Printing folder.
 */

const { getAuthorizedDriveClient } = require('./googleDriveOAuthService');
const logger = require('../utils/logger');

const FOLDER_MIME = 'application/vnd.google-apps.folder';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Parse "DD.MM.YYYY" from an archive date folder name into a UTC midnight Date.
 * Returns null if the format is not recognised.
 */
function parseFolderDate(name = '') {
  const m = String(name).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sort key for month folder names like "04 April 2026" → [2026, 4]. */
function monthFolderSortKey(name = '') {
  const m = String(name).match(/^(\d+)\D+(\d{4})/);
  return m ? [parseInt(m[2], 10), parseInt(m[1], 10)] : [0, 0];
}

/** Date → "04 April 2026" (matches the existing month folder naming). */
function monthFolderName(date) {
  const month = date.getMonth() + 1;
  return `${String(month).padStart(2, '0')} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Date → "01.04.2026" (matches the existing date folder naming). */
function dateFolderName(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

/** Every subfolder of a folder — follows pageToken, so nothing is cut off. */
async function listSubfolders(drive, parentId) {
  const folders = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id,name)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    folders.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return folders;
}

async function createFolder(drive, parentId, name) {
  const res = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id,name',
    supportsAllDrives: true,
  });
  return res.data;
}

/**
 * Finds the first existing child folder `match()` accepts, creating one named
 * `createName` when there is none. Returns { id, name, created }.
 */
async function findOrCreateFolder(drive, parentId, { match, createName }) {
  const existing = await listSubfolders(drive, parentId);
  const hit = existing.find((f) => match(f.name));
  if (hit) return { id: hit.id, name: hit.name, created: false };
  const made = await createFolder(drive, parentId, createName);
  return { id: made.id, name: made.name, created: true };
}

/** True when a folder name is exactly this order number (optionally suffixed). */
function isOrderFolderName(name, orderNumber) {
  return new RegExp(`^${orderNumber}(?:[\\s\\-_].*)?$`).test(String(name).trim());
}

/**
 * Resolves <archive>/<month>/<date>/Printing/<orderNumber>, creating whatever
 * part of that path does not exist yet. Idempotent — an order folder that is
 * already there is reused.
 *
 * Returns { orderFolderId, orderFolderName, printingFolderId, created } or
 * null when DRIVE_ARCHIVE_FOLDER_ID is not configured.
 */
async function ensureArchiveOrderFolder({ orderNumber, date = new Date(), drive = null, label = null }) {
  const archiveFolderId = process.env.DRIVE_ARCHIVE_FOLDER_ID;
  if (!archiveFolderId) return null;
  if (orderNumber == null || orderNumber === '') return null;

  const client = drive || (await getAuthorizedDriveClient());

  const [wantYear, wantMonth] = [date.getFullYear(), date.getMonth() + 1];
  const month = await findOrCreateFolder(client, archiveFolderId, {
    match: (name) => {
      const [y, m] = monthFolderSortKey(name);
      return y === wantYear && m === wantMonth;
    },
    createName: monthFolderName(date),
  });

  const wantDateName = dateFolderName(date);
  const wantDateTs = parseFolderDate(wantDateName)?.getTime();
  const dateFolder = await findOrCreateFolder(client, month.id, {
    match: (name) => parseFolderDate(name)?.getTime() === wantDateTs,
    createName: wantDateName,
  });

  const printing = await findOrCreateFolder(client, dateFolder.id, {
    match: (name) => String(name).toLowerCase().includes('print'),
    createName: 'Printing',
  });

  const orderFolder = await ensureOrderFolderInPrinting(client, printing.id, orderNumber, label);

  return {
    orderFolderId: orderFolder.id,
    orderFolderName: orderFolder.name,
    printingFolderId: printing.id,
    created: orderFolder.created,
  };
}

/**
 * Finds (or creates) the "Printing" folder that sits next to a date folder's
 * other sections. `create: false` returns null instead of creating one.
 */
async function ensurePrintingFolder(drive, dateFolderId, { create = true } = {}) {
  const siblings = await listSubfolders(drive, dateFolderId);
  const found = siblings.find((f) => String(f.name).toLowerCase().includes('print'));
  if (found) return { id: found.id, name: found.name, created: false };
  if (!create) return null;
  const made = await createFolder(drive, dateFolderId, 'Printing');
  return { id: made.id, name: made.name, created: true };
}

/** Drive-safe version of a name fragment used in a folder name. */
function sanitizeLabel(value = '') {
  return String(value).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * "793 Anand - Ramesh Traders" from its parts. Accepts a string or an array
 * (assignee first, customer after); empty parts drop out.
 */
function buildOrderFolderName(orderNumber, label) {
  const parts = (Array.isArray(label) ? label : [label])
    .map((part) => sanitizeLabel(part))
    .filter(Boolean);
  return parts.length ? `${orderNumber} ${parts.join(' - ')}` : String(orderNumber);
}

/**
 * Order-number folder inside a known Printing folder. `label` (the assignee
 * picked when the order was confirmed) is appended, so the folder reads
 * "793 Anand" rather than a bare number. A folder already named after this
 * order number is reused as-is, whatever suffix it carries.
 */
async function ensureOrderFolderInPrinting(drive, printingFolderId, orderNumber, label = null) {
  const desired = buildOrderFolderName(orderNumber, label);
  const existing = await listSubfolders(drive, printingFolderId);
  const hit = existing.find((f) => isOrderFolderName(f.name, orderNumber));

  if (!hit) {
    const made = await createFolder(drive, printingFolderId, desired);
    return { id: made.id, name: made.name, created: true };
  }

  // Fill in a name that is still missing pieces — "793" or "793 Anand"
  // becomes "793 Anand - Ramesh Traders". A name that is anything else was
  // typed by a person and is left exactly as it is.
  const current = String(hit.name).trim();
  if (current !== desired && desired.startsWith(current)) {
    try {
      await drive.files.update({
        fileId: hit.id,
        supportsAllDrives: true,
        requestBody: { name: desired },
        fields: 'id,name',
      });
      return { id: hit.id, name: desired, created: false, renamed: true };
    } catch (err) {
      logger.warn('driveArchiveFolderService: folder rename %s → %s failed — %s', current, desired, err?.message);
    }
  }
  return { id: hit.id, name: hit.name, created: false };
}

/**
 * Creates the "<orderNumber>" folder in the Printing folder belonging to the
 * SAME date folder the design file itself lives in — i.e. a file in
 *   .../04 April 2026/01.04.2026/Final/153 - ....cdr
 * gets its folder at
 *   .../04 April 2026/01.04.2026/Printing/153
 *
 * The file's own location decides the date, so confirming an old file never
 * writes into today's folder. Falls back to today's archive date folder when
 * the file's parents cannot be resolved (e.g. it has no date folder above it).
 */
async function ensureOrderFolderBesideFile({ fileId, orderNumber, drive = null, label = null }) {
  if (orderNumber == null || orderNumber === '') return null;
  const client = drive || (await getAuthorizedDriveClient());

  let dateFolderId = null;
  if (fileId) {
    const file = await client.files.get({ fileId, fields: 'id,parents', supportsAllDrives: true });
    const sectionId = file.data.parents?.[0];
    if (sectionId) {
      const section = await client.files.get({ fileId: sectionId, fields: 'id,name,parents', supportsAllDrives: true });
      dateFolderId = section.data.parents?.[0] || null;
    }
  }

  if (!dateFolderId) return ensureArchiveOrderFolder({ orderNumber, drive: client, label });

  const printing = await ensurePrintingFolder(client, dateFolderId);
  const orderFolder = await ensureOrderFolderInPrinting(client, printing.id, orderNumber, label);
  return {
    orderFolderId: orderFolder.id,
    orderFolderName: orderFolder.name,
    printingFolderId: printing.id,
    created: orderFolder.created,
  };
}

/**
 * ensureArchiveOrderFolder that can never break its caller — every Drive
 * failure is logged and swallowed, exactly like the existing rename blocks in
 * the design-files flow. Returns null when nothing could be created.
 */
async function ensureArchiveOrderFolderSafe({ orderNumber, date, drive, fileId = null, label = null }) {
  try {
    return fileId
      ? await ensureOrderFolderBesideFile({ fileId, orderNumber, drive, label })
      : await ensureArchiveOrderFolder({ orderNumber, date, drive, label });
  } catch (err) {
    logger.warn(
      'driveArchiveFolderService: could not ensure Printing folder for order %s — %s',
      orderNumber,
      err?.message
    );
    return null;
  }
}

module.exports = {
  FOLDER_MIME,
  buildOrderFolderName,
  parseFolderDate,
  monthFolderSortKey,
  monthFolderName,
  dateFolderName,
  listSubfolders,
  isOrderFolderName,
  ensurePrintingFolder,
  ensureOrderFolderInPrinting,
  ensureOrderFolderBesideFile,
  ensureArchiveOrderFolder,
  ensureArchiveOrderFolderSafe,
};
