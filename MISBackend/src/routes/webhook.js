const express = require('express');
const {
  verifyWebhook,
  receiveWebhook,
  metabspWebhookReceive,
  metabspWebhookVerify,
} = require('../controllers/whatsappController');

const router = express.Router();

router.get('/', verifyWebhook);
router.post('/', receiveWebhook);

router.get('/metabsp', metabspWebhookVerify);
router.post('/metabsp', metabspWebhookReceive);

module.exports = router;
