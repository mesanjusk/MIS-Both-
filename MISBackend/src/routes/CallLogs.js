const { requireAuth } = require('../middleware/auth');
const express = require("express");
const router = express.Router();
const CallLogs = require("../repositories/callLogs");
const { v4: uuid } = require("uuid");
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');


router.use(requireAuth);

router.post("/addCallLog", async (req, res) => {
    const { Name, Mobile_number, Type, Duration, Status } = req.body;

    try {
        const check = await CallLogs.findOne({ Mobile_number });

        if (check) {
            return res.json({ success: false, message: "CallLog already exists." });
        } else {
            const newCall = new CallLogs({
                Name,
                Mobile_number,
                Type,
                Duration,
                Status,
                CallLog_uuid: uuid(),
            });

            await newCall.save();
            return res.json({ success: true, message: "CallLog saved successfully!" });
        }
    } catch (e) {
        logger.error("Error saving call:", e);
        return res.status(500).json({ success: false, message: "Error saving CallLog" });
    }
});



  module.exports = router;