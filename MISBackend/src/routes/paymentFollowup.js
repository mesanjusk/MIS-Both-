const { requireAuth, requireInternalKey } = require('../middleware/auth');
// routes/paymentFollowup.js
const express = require("express");
const router = express.Router();
const { v4: uuid } = require("uuid");
const PaymentFollowup = require("../repositories/paymentFollowup");
const logger = require('../utils/logger');

/* ----------------------- helpers ----------------------- */
const norm = (s) => String(s || "").trim();
const toDate = (v, fallback = new Date()) => (v ? new Date(v) : fallback);

// Add a new payment follow-up
router.use(requireAuth);

router.post("/add", async (req, res) => {
  try {
    const Customer = norm(req.body.Customer);
    const Amount = Number(req.body.Amount || 0);
    const Title = norm(req.body.Title);
    const Remark = norm(req.body.Remark);
    const Followup_date = toDate(req.body.Followup_date);

    if (!Customer || !Amount || Amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Customer and valid Amount required" });
    }

    // De-duplication rule:
    // Same customer + followup_date (same day) + amount considered duplicate.
    const start = new Date(Followup_date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(Followup_date);
    end.setHours(23, 59, 59, 999);

    const exists = await PaymentFollowup.findOne({
      customer_name: Customer,
      amount: Amount,
      followup_date: { $gte: start, $lte: end },
    }).lean();

    if (exists) {
      // Match your existing front-end pattern
      return res.send("exist");
    }

    const doc = await PaymentFollowup.create({
      followup_uuid: uuid(),
      customer_name: Customer,
      amount: Amount,
      title: Title,
      remark: Remark,
      followup_date: Followup_date,
      status: "pending",
      created_by: norm(req.user?.name || ""), // optional if you attach auth
    });

    if (doc?._id) {
      return res.send("notexist");
    }
    return res.json({ success: true, result: doc });
  } catch (err) {
    logger.error("Add payment follow-up error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// List follow-ups (optional query: status=pending/done, customer=Name)
router.get("/list", async (req, res) => {
  try {
    const status = norm(req.query.status);
    const customer = norm(req.query.customer);

    const q = {};
    if (status) q.status = status;
    if (customer) q.customer_name = customer;

    const result = await PaymentFollowup.find(q)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, result });
  } catch (err) {
    logger.error("List payment follow-ups error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update status (pending/done)
router.patch("/:id/status", async (req, res) => {
  try {
    const id = req.params.id; // Mongo _id
    const status = norm(req.body.status).toLowerCase();
    if (!["pending", "done"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const updated = await PaymentFollowup.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).lean();

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Follow-up not found" });
    }
    return res.json({ success: true, result: updated });
  } catch (err) {
    logger.error("Update payment follow-up status error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


// POST /paymentfollowup/send-overdue-reminders
// Finds all pending followups overdue by >= X days and sends WhatsApp reminders.
router.post('/send-overdue-reminders', requireInternalKey, async (req, res) => {
  try {
    const { minDaysOverdue = 3 } = req.body || {};
    const Customers = require('../repositories/customer');
    const { sendMessage } = require('../services/metaApiService');
    const cutoffDate = new Date(Date.now() - Number(minDaysOverdue || 3) * 24 * 60 * 60 * 1000);
    const overdueFollowups = await PaymentFollowup.find({
      status: 'pending',
      followup_date: { $lte: cutoffDate },
    }).lean();

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const followup of overdueFollowups) {
      try {
        if (!phoneNumberId || !accessToken) {
          skipped += 1;
          continue;
        }
        const customer = await Customers.findOne({
          $or: [
            { Customer_name: followup.customer_name },
            { Customer_uuid: followup.Customer_uuid || followup.customerUuid || '' },
          ],
        }).lean();
        const mobile = String(customer?.Mobile_number || followup.Mobile_number || '').replace(/D/g, '');
        if (!mobile) {
          skipped += 1;
          continue;
        }
        const amountStr = `₹${Number(followup.amount || 0).toLocaleString('en-IN')}`;
        const msg = [
          `Dear ${followup.customer_name || 'Customer'},`,
          '',
          `This is a payment reminder for ${amountStr} pending against your order/account.`,
          '',
          'Kindly arrange payment at the earliest.',
          '',
          'Thank you.',
        ].join('\n');

        await sendMessage({
          phoneNumberId,
          accessToken,
          payload: {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: mobile,
            type: 'text',
            text: { preview_url: false, body: msg },
          },
        });

        await PaymentFollowup.findByIdAndUpdate(followup._id, {
          Last_Reminder: new Date(),
          Reminder_Count: Number(followup.Reminder_Count || 0) + 1,
        });
        sent += 1;
      } catch (innerErr) {
        logger.error('Reminder failed for followup:', followup._id, innerErr.message);
        failed += 1;
      }
    }

    res.json({ sent, failed, skipped, total: overdueFollowups.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
