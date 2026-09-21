const express = require('express');
const router = express.Router();

const { AppSetting } = require('../repositories/appSetting');
const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');

const SETTINGS_KEY = 'network_file_settings';

const EMPTY_SETTINGS = Object.freeze({
  serverLocalPath: '',
  networkShareRoot: '',
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
