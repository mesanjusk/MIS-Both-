const express = require('express');
const router = express.Router();

const { AppSetting } = require('../repositories/appSetting');
const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const { getAuthorizedDriveClient } = require('../services/googleDriveOAuthService');
const {
  listSubfolders,
  parseFolderDate,
  ensurePrintingFolder,
  isOrderFolderName,
} = require('../services/driveArchiveFolderService');

const SETTINGS_KEY = 'network_file_settings';
const PRINTING_PREVIEW_CACHE_MS = 60 * 1000;

const EMPTY_SETTINGS = Object.freeze({
  serverLocalPath: '',
  networkShareRoot: '',
  driveAnchorFolderName: '',
  note: '',
});

let printingPreviewCache = { expiresAt: 0, byOrder: new Map() };
let printingPreviewScanPromise = null;

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizeWindowsPath(value) {
  let path = cleanText(value, 1000);
  if (!path) return '';

  path = path.replace(/^["']|["']$/g, '').replace(/\//g, '\\');

  if (!/^[A-Za-z]:\\$/.test(path)) {
    path = path.replace(/\\+$/g, '');
  }

  return path;
}

function normalizeSettings(value = {}) {
  return {
    serverLocalPath: normalizeWindowsPath(value.serverLocalPath),
    networkShareRoot: normalizeWindowsPath(value.networkShareRoot),
    driveAnchorFolderName: cleanText(value.driveAnchorFolderName, 255),
    note: cleanText(value.note, 1000),
  };
}

router.get('/settings', requireAuth, async (_req, res) => {
  try {
    const saved = await AppSetting.getSetting(SETTINGS_KEY, EMPTY_SETTINGS);
    return res.json({ success: true, result: normalizeSettings(saved) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

function sanitizeWindowsSegment(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveDriveRelativePath(fileId, anchorName) {
  const drive = await getAuthorizedDriveClient();
  const file = await drive.files.get({
    fileId,
    fields: 'id,name,parents',
    supportsAllDrives: true,
  });

  const parentNames = [];
  let parentId = file.data.parents?.[0] || null;

  for (let depth = 0; parentId && depth < 16; depth += 1) {
    const parent = await drive.files.get({
      fileId: parentId,
      fields: 'id,name,parents',
      supportsAllDrives: true,
    });
    parentNames.unshift(String(parent.data.name || '').trim());
    parentId = parent.data.parents?.[0] || null;
  }

  const anchor = String(anchorName || '').trim().toLowerCase();
  let relativeFolders = parentNames;
  if (anchor) {
    const anchorIndex = parentNames
      .map((name) => name.toLowerCase())
      .lastIndexOf(anchor);
    relativeFolders = anchorIndex >= 0 ? parentNames.slice(anchorIndex + 1) : [];
  }

  const segments = [
    ...relativeFolders.map(sanitizeWindowsSegment).filter(Boolean),
    sanitizeWindowsSegment(file.data.name),
  ].filter(Boolean);

  return {
    fileName: file.data.name || '',
    parentNames,
    anchorFound: !anchor || parentNames.some((name) => name.toLowerCase() === anchor),
    relativePath: segments.join('\\'),
  };
}

function fileExtension(name = '') {
  const clean = String(name || '').toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1) : '';
}

function previewRank(file, orderNumber) {
  const ext = fileExtension(file?.name);
  const startsWithOrder = new RegExp(`^${orderNumber}(?:[\\s_-]|$)`, 'i').test(String(file?.name || '').trim());
  const imageRank = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ext) ? 400 : 0;
  const pdfRank = ext === 'pdf' ? 300 : 0;
  const corelRank = ['cdr', 'cmx'].includes(ext) ? 200 : 0;
  const genericRank = imageRank || pdfRank || corelRank ? 0 : 100;
  return (startsWithOrder ? 1000 : 0) + imageRank + pdfRank + corelRank + genericRank;
}

async function listFilesInFolder(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || null;
  } while (pageToken);
  return files;
}

async function buildPrintingPreviewMap() {
  const archiveFolderId = cleanText(process.env.DRIVE_ARCHIVE_FOLDER_ID, 255);
  if (!archiveFolderId) return new Map();

  const drive = await getAuthorizedDriveClient();
  const byOrder = new Map();
  const monthFolders = await listSubfolders(drive, archiveFolderId);

  for (const monthFolder of monthFolders) {
    const dateFolders = await listSubfolders(drive, monthFolder.id);
    for (const dateFolder of dateFolders.filter((folder) => parseFolderDate(folder.name))) {
      const printingFolder = await ensurePrintingFolder(drive, dateFolder.id, { create: false });
      if (!printingFolder) continue;

      const orderFolders = await listSubfolders(drive, printingFolder.id);
      for (const orderFolder of orderFolders) {
        const match = String(orderFolder.name || '').trim().match(/^(\d+)(?:[\s_-]|$)/);
        if (!match) continue;
        const orderNumber = Number(match[1]);
        if (!orderNumber) continue;

        const files = await listFilesInFolder(drive, orderFolder.id);
        if (!files.length) continue;

        files.sort((a, b) => previewRank(b, orderNumber) - previewRank(a, orderNumber)
          || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
        const best = files[0];
        const relativePath = [
          monthFolder.name,
          dateFolder.name,
          printingFolder.name,
          orderFolder.name,
          best.name,
        ].map(sanitizeWindowsSegment).filter(Boolean).join('\\');

        const existing = byOrder.get(orderNumber);
        if (!existing || String(best.modifiedTime || '') > String(existing.modifiedTime || '')) {
          byOrder.set(orderNumber, {
            fileId: best.id,
            fileName: best.name,
            mimeType: best.mimeType || '',
            modifiedTime: best.modifiedTime || '',
            orderFolderId: orderFolder.id,
            orderFolderName: orderFolder.name,
            relativePath,
          });
        }
      }
    }
  }

  return byOrder;
}

async function getPrintingPreviewMap({ refresh = false } = {}) {
  if (!refresh && printingPreviewCache.expiresAt > Date.now()) {
    return printingPreviewCache.byOrder;
  }
  if (printingPreviewScanPromise) return printingPreviewScanPromise;

  printingPreviewScanPromise = buildPrintingPreviewMap()
    .then((byOrder) => {
      printingPreviewCache = {
        byOrder,
        expiresAt: Date.now() + PRINTING_PREVIEW_CACHE_MS,
      };
      return byOrder;
    })
    .finally(() => {
      printingPreviewScanPromise = null;
    });

  return printingPreviewScanPromise;
}

router.get('/printing-preview/:orderNumber', requireAuth, async (req, res) => {
  try {
    const orderNumber = Number(req.params.orderNumber);
    if (!Number.isInteger(orderNumber) || orderNumber <= 0) {
      return res.status(400).json({ success: false, message: 'Valid order number is required.' });
    }

    const settings = normalizeSettings(
      await AppSetting.getSetting(SETTINGS_KEY, EMPTY_SETTINGS)
    );
    const previews = await getPrintingPreviewMap({ refresh: String(req.query.refresh || '').toLowerCase() === 'true' });
    const preview = previews.get(orderNumber) || null;

    return res.json({
      success: true,
      result: preview ? {
        ...preview,
        networkShareRoot: settings.networkShareRoot,
        driveUrl: `https://drive.google.com/file/d/${preview.fileId}/view`,
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/resolve', requireAuth, async (req, res) => {
  try {
    const fileId = cleanText(req.query.fileId, 255);
    if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
      return res.status(400).json({ success: false, message: 'Valid Google Drive fileId is required.' });
    }

    const settings = normalizeSettings(
      await AppSetting.getSetting(SETTINGS_KEY, EMPTY_SETTINGS)
    );

    if (!settings.networkShareRoot) {
      return res.status(409).json({
        success: false,
        message: 'Network file share is not configured in Admin → Network Files.',
        result: { settings },
      });
    }

    try {
      const resolved = await resolveDriveRelativePath(
        fileId,
        settings.driveAnchorFolderName
      );
      return res.json({
        success: true,
        result: {
          ...resolved,
          networkShareRoot: settings.networkShareRoot,
        },
      });
    } catch (driveErr) {
      // Opening the LAN copy should still be possible when Drive is temporarily
      // unavailable. The frontend falls back to the stored file name under the
      // configured share root.
      return res.json({
        success: true,
        result: {
          networkShareRoot: settings.networkShareRoot,
          relativePath: '',
          driveLookupFailed: true,
          message: driveErr?.message || 'Drive path lookup failed',
        },
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/settings', requireAuth, requireAdminOrOwner, async (req, res) => {
  try {
    const value = normalizeSettings(req.body || {});

    if (value.serverLocalPath && !/^[A-Za-z]:\\/.test(value.serverLocalPath)) {
      return res.status(400).json({
        success: false,
        message: 'Server local folder must be a Windows drive path such as E:\\Daily Work\\1 Month.',
      });
    }

    if (value.networkShareRoot && !/^\\\\[^\\]+\\[^\\]+/.test(value.networkShareRoot)) {
      return res.status(400).json({
        success: false,
        message: 'Network share must be a UNC path such as \\\\SERVER-PC\\DailyWork\\1 Month.',
      });
    }

    await AppSetting.upsertSetting({
      key: SETTINGS_KEY,
      value,
      description: 'Windows local and LAN shared folder used by Bills file shortcuts',
    });

    return res.json({ success: true, result: value });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
