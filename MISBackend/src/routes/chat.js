const { requireAuth } = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const Message = require('../repositories/Message');
const Customer = require('../repositories/customer');
const logger = require('../utils/logger');

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');
const buildPhoneVariants = (value = '') => {
  const digits = normalizeDigits(value);
  const last10 = digits.slice(-10);
  return [...new Set([value, digits, last10, `+${digits}`, `91${last10}`, `+91${last10}`].filter(Boolean))];
};

/**
 * GET /chatlist
 * Returns customers who have any WhatsApp chat history.
 */
router.use(requireAuth);

router.get('/chatlist', async (_req, res) => {
  try {
    const messages = await Message.find({}).sort({ timestamp: -1, time: -1, createdAt: -1 }).lean();
    const numberSet = new Set();

    messages.forEach((message) => {
      const from = normalizeDigits(message?.from);
      const to = normalizeDigits(message?.to);
      if (message?.fromMe || message?.direction === 'outgoing') {
        if (to) numberSet.add(to.slice(-10));
      } else if (from) {
        numberSet.add(from.slice(-10));
      }
    });

    const numbers = [...numberSet].filter(Boolean);
    const phoneRegexes = numbers.map((num) => new RegExp(`${num}$`));
    const customers = phoneRegexes.length
      ? await Customer.find({ Mobile_number: { $in: phoneRegexes } }).lean()
      : [];

    return res.json({ success: true, list: customers });
  } catch (err) {
    logger.error('Error in /chatlist:', err);
    return res.status(500).json({ success: false, error: 'Failed to load chat list' });
  }
});

/**
 * GET /messages/:number
 * Returns WhatsApp messages for a phone number.
 */
router.get('/messages/:number', async (req, res) => {
  try {
    const variants = buildPhoneVariants(req.params.number);
    const messages = await Message.find({
      $or: [{ from: { $in: variants } }, { to: { $in: variants } }],
    })
      .sort({ timestamp: 1, time: 1, createdAt: 1 })
      .lean();

    return res.json({ success: true, messages });
  } catch (err) {
    logger.error('Error in /messages/:number:', err);
    return res.status(500).json({ success: false, error: 'Failed to load messages' });
  }
});

/**
 * GET /customer/by-number/:number
 * Finds a customer by normalized WhatsApp number.
 */
router.get('/customer/by-number/:number', async (req, res) => {
  try {
    const variants = buildPhoneVariants(req.params.number);
    const regexes = variants.map((num) => new RegExp(`${normalizeDigits(num).slice(-10)}$`));

    const customer = await Customer.findOne({
      $or: [
        { Mobile_number: { $in: variants } },
        { Mobile_number: { $in: regexes } },
      ],
    }).lean();

    if (customer) return res.json({ success: true, customer });
    return res.json({ success: false, error: 'Customer not found' });
  } catch (err) {
    logger.error('Error in /customer/by-number:', err);
    return res.status(500).json({ success: false, error: 'Error fetching customer' });
  }
});

module.exports = router;
