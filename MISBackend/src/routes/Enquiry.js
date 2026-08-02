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

// Enquiries auto-created from a cold inbound WhatsApp message that nobody has
// looked at yet — the "customer messaged a new order and nobody entered it"
// gap. Surfaced separately from the normal enquiry list so they get triaged
// instead of getting lost among manually-created ones.
router.get("/unreviewed", async (_req, res) => {
  try {
    const enquiries = await Enquiry.find({ source: "whatsapp_auto", status: "unreviewed" })
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