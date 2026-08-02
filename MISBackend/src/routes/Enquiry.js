const { requireAuth } = require('../middleware/auth');
const express = require("express");
const router = express.Router();
const Enquiry = require("../repositories/enquiry");
const { v4: uuid } = require("uuid");
const logger = require('../utils/logger');

router.use(requireAuth);

router.post("/addEnquiry", async (req, res) => {
  const { Customer_name, Priority = "Normal", Item = "New Enquiry", Task = "Design", Delivery_Date, Assigned = "Sai", Remark } = req.body;

  if (!Customer_name) {
    return res.status(400).json({ success: false, message: "Customer_name is required" });
  }

  try {

      const currentDate = new Date().toISOString().split('T')[0];

      const lastEnquiry = await Enquiry.findOne().sort({ Enquiry_Number: -1 }).lean();
      const newEnquiryNumber = lastEnquiry ? lastEnquiry.Enquiry_Number + 1 : 1;

      const newEnquiry = new Enquiry({
        Enquiry_uuid: uuid(),
        Enquiry_Number: newEnquiryNumber,
          Customer_name,
          Priority: Priority || "Normal",
          Item: Item || "New Category", 
          Task: Task || "Design",       
          Delivery_Date: Delivery_Date || currentDate, 
          Assigned: Assigned || "Sai",  
          Remark
      });

      await newEnquiry.save();
      res.json({ success: true, message: "Enquiry added successfully" });
  } catch (error) {
      logger.error("Error saving Enquiry:", error);
      res.status(500).json({ success: false, message: "Failed to add Enquiry" });
  }
});

// Quick-log shortcut for staff who spot a new order on the REGULAR WhatsApp
// Business number (the phone-app one, not the API-connected number) — that
// number has no webhook, so nothing can auto-detect those messages. This
// endpoint exists so logging one takes seconds instead of the full add-enquiry
// form, which is the difference between it getting entered right away vs.
// getting forgotten until the customer chases it up days later.
//
// Body: { customerUuid?, Customer_name, mobileNumber, message, Priority?, Delivery_Date? }
router.post("/quick-log", async (req, res) => {
  const { customerUuid, Customer_name, mobileNumber, message, Priority, Delivery_Date } = req.body || {};

  if (!Customer_name || !String(Customer_name).trim()) {
    return res.status(400).json({ success: false, message: "Customer name is required" });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ success: false, message: "Message / order details are required" });
  }

  try {
    const lastEnquiry = await Enquiry.findOne().sort({ Enquiry_Number: -1 }).lean();
    const newEnquiryNumber = lastEnquiry ? lastEnquiry.Enquiry_Number + 1 : 1;
    const loggedBy = req.user?.userName || req.user?.User_name || "Staff";

    const enquiry = await Enquiry.create({
      Enquiry_uuid: uuid(),
      Enquiry_Number: newEnquiryNumber,
      Customer_name: String(Customer_name).trim(),
      Priority: Priority || "Normal",
      Item: String(message).trim().slice(0, 80),
      Task: "Enquiry",
      Assigned: loggedBy,
      Delivery_Date: Delivery_Date || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      Remark: String(message).trim().slice(0, 2000),
      source: "whatsapp_manual",
      status: "unreviewed",
      customerUuid: customerUuid || null,
      mobileNumber: mobileNumber || null,
    });

    res.json({ success: true, enquiry });
  } catch (error) {
    logger.error("Error quick-logging WhatsApp enquiry:", error);
    res.status(500).json({ success: false, message: "Failed to log enquiry" });
  }
});

// Enquiries auto-created from a cold inbound WhatsApp message that nobody has
// looked at yet — the "customer messaged a new order and nobody entered it"
// gap. Surfaced separately from the normal enquiry list so they get triaged
// instead of getting lost among manually-created ones.
router.get("/unreviewed", async (_req, res) => {
  try {
    const enquiries = await Enquiry.find({ source: { $in: ["whatsapp_auto", "whatsapp_manual"] }, status: "unreviewed" })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, count: enquiries.length, enquiries });
  } catch (error) {
    logger.error("Error fetching unreviewed enquiries:", error);
    res.status(500).json({ success: false, message: "Failed to fetch unreviewed enquiries" });
  }
});

router.put("/:id/review", async (req, res) => {
  const { status } = req.body || {};
  if (!["reviewed", "converted", "dismissed"].includes(status)) {
    return res.status(400).json({ success: false, message: "status must be reviewed, converted, or dismissed" });
  }
  try {
    const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
    res.json({ success: true, enquiry });
  } catch (error) {
    logger.error("Error updating enquiry review status:", error);
    res.status(500).json({ success: false, message: "Failed to update enquiry" });
  }
});

  module.exports = router;