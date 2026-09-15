const { requireAuth } = require('../middleware/auth');
const express = require("express");
const router = express.Router();
const Usertasks = require("../repositories/usertask");
const Counter = require("../repositories/counter");
const { v4: uuid } = require("uuid");
const { sendWhatsAppText } = require('../services/unifiedWhatsAppService');
const { whatsappLimiter } = require('../middleware/rateLimit');
const normalizeWhatsAppNumber = require("../utils/normalizeNumber");
const logger = require('../utils/logger');

// Add new user task and optionally send WhatsApp message to user
router.use(requireAuth);

router.post("/addUsertask", async (req, res) => {
  const { Usertask_name, User, Deadline, Remark } = req.body;
  const assignedBy = req.user?.userName || req.user?.User_name || 'Admin';

  try {
    const data = await Usertasks.findOne({ Usertask_name });

    if (data) {
      return res.status(409).json({ success: false, message: "Task already exists" });
    }

    const taskCounter = await Counter.findByIdAndUpdate(
      'usertask_number',
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    const newTaskNumber = Number(taskCounter?.seq || 1);
    const newTask = new Usertasks({
      Usertask_name,
      User,
      AssignedBy: assignedBy,
      Usertask_Number: newTaskNumber,
      Date: new Date().toISOString().split("T")[0],
      Time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      Usertask_uuid: uuid(),
      Deadline,
      Remark,
      Status: "Pending"
    });
    await newTask.save();

      // ✅ Format number before sending message
      try {
        const formattedNumber = normalizeWhatsAppNumber(User);
        await sendWhatsAppText({
          to: formattedNumber,
          body: `Hello! Your task "${Usertask_name}" has been created and is pending. Deadline: ${Deadline || "N/A"}. Assigned by: ${assignedBy}`,
          source: 'TASK_ASSIGNED',
          activity: 'TASK_NOTIFICATIONS',
          contactName: User || '',
        });
      } catch (err) {
        logger.error("Failed to send WhatsApp message:", err.message);
      }

    res.status(201).json({ success: true, result: newTask });
  } catch (e) {
    logger.error("Error saving Task:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

// WhatsApp's own cap on a text message body.
const MAX_WHATSAPP_TEXT_LENGTH = 4096;

// Direct WhatsApp message route.
//
// This is the one route in this file that sends free text to a number the
// caller names, so it can spend the business's WhatsApp account. The
// router-wide requireAuth above is not enough on its own: with no cap, one
// leaked staff token can pump messages through the account faster than anyone
// notices, and a number that sends in that pattern gets rate-limited or banned
// by Meta. It therefore carries the same 30-per-minute, per-user limit as
// /api/whatsapp/send-text, which is the equivalent route on the WhatsApp
// router.
router.post('/send-message', whatsappLimiter, async (req, res) => {
  const mobile = String(req.body?.mobile ?? '').trim();
  const message = String(req.body?.message ?? '').trim();

  if (!mobile || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // normalizeWhatsAppNumber prefixes 91 to whatever it is handed, so "abc"
  // comes back as the bare "91" and would be passed to the provider as a real
  // recipient. Validate the digits before normalizing, not after.
  const digits = mobile.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return res.status(400).json({ error: 'A valid mobile number is required' });
  }

  if (message.length > MAX_WHATSAPP_TEXT_LENGTH) {
    return res
      .status(400)
      .json({ error: `Message must be ${MAX_WHATSAPP_TEXT_LENGTH} characters or fewer` });
  }

  try {
    const formattedMobile = normalizeWhatsAppNumber(mobile);
    await sendWhatsAppText({ to: formattedMobile, body: message, source: 'TASK_MESSAGE', activity: 'TASK_NOTIFICATIONS' });
    logger.info(
      { to: formattedMobile, by: req.user?.userName || req.user?.id || '' },
      '[usertasks] direct WhatsApp message sent'
    );
    // The provider's raw reply carries account-level detail the browser has no
    // use for. Callers only branch on `error`, so an explicit success is
    // enough.
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('WhatsApp Send Error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get all user tasks
router.get("/GetUsertaskList", async (req, res) => {
  try {
    let data = await Usertasks.find({}).lean();
    if (data.length)
      res.json({ success: true, result: data.filter((a) => a.Usertask_name) });
    else res.status(404).json({ success: false, message: "Task Not found" });
  } catch (err) {
    logger.error("Error fetching Task:", err);
    res.status(500).json({ success: false, message: err });
  }
});

// Update a user task
router.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const { Usertask_name, Usertask_Number, Deadline, Remark, Status } = req.body;

  try {
    const user = await Usertasks.findByIdAndUpdate(
      id,
      {
        Usertask_name,
        Usertask_Number,
        Deadline,
        Remark,
        Status
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    res.json({ success: true, result: user });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
