const express = require("express");
const router = express.Router();
const WhatsAppActionLog = require("../repositories/WhatsAppActionLog");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/authorize");

// Accountability trail for order actions taken from WhatsApp — admin-only,
// same tier as the other audit-facing admin screens.
router.use(requireAuth, requireAdmin);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

    const filter = {};
    if (req.query.result) filter.result = req.query.result;
    if (req.query.phone) filter.phone = String(req.query.phone).replace(/\D/g, "");
    if (req.query.orderNumber) filter.orderNumber = Number(req.query.orderNumber);

    const [rows, total] = await Promise.all([
      WhatsAppActionLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WhatsAppActionLog.countDocuments(filter),
    ]);

    res.json({ success: true, result: rows, total, page, limit });
  })
);

module.exports = router;
