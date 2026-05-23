const express = require('express');
const router = express.Router();
const { AppSetting } = require('../repositories/appSetting');
const { requireAuth } = require('../middleware/auth');

const PROFILE_KEY = 'business_profile';

router.get('/', requireAuth, async (_req, res) => {
  try {
    const profile = await AppSetting.getSetting(PROFILE_KEY, {});
    res.json({ success: true, result: profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const { name, addressLine1, addressLine2, city, phone, email, gst, upiId, upiName } = req.body;
    const value = { name, addressLine1, addressLine2, city, phone, email, gst, upiId, upiName };
    await AppSetting.upsertSetting({
      key: PROFILE_KEY,
      value,
      description: 'Business profile for invoices and QR code',
    });
    res.json({ success: true, result: value });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
