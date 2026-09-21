const express = require('express');
const router = express.Router();

const { AppSetting } = require('../repositories/appSetting');
const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const { getAuthorizedDriveClient } = require('../services/googleDriveOAuthService');

const SETTINGS_KEY = 'network_file_settings';

const EMPTY_SETTINGS = Object.freeze({
  serverLocalPath: '',
  networkShareRoot: '',
  driveAnchorFolderName: '',
  note: '',
});

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
