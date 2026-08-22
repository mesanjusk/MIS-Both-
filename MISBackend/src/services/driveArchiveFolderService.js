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

async function listSubfolders(drive, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 500,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
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
async function ensureArchiveOrderFolder({ orderNumber, date = new Date(), drive = null }) {
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

  const orderFolder = await findOrCreateFolder(client, printing.id, {
    match: (name) => isOrderFolderName(name, orderNumber),
    createName: String(orderNumber),
  });

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
async function ensureArchiveOrderFolderSafe({ orderNumber, date, drive }) {
  try {
    return await ensureArchiveOrderFolder({ orderNumber, date, drive });
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
  parseFolderDate,
  monthFolderSortKey,
  monthFolderName,
  dateFolderName,
  ensureArchiveOrderFolder,
  ensureArchiveOrderFolderSafe,
};
