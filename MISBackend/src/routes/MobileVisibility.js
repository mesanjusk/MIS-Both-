const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getMobileVisibilitySettings, saveMobileVisibilitySettings } = require('../utils/mobileVisibility');

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const result = await getMobileVisibilitySettings();
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error fetching mobile visibility settings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/', async (req, res) => {
  try {
    const result = await saveMobileVisibilitySettings(req.body || {});
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error saving mobile visibility settings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
