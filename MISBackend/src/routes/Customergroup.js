const { requireAuth } = require('../middleware/auth');
const express = require("express");
const router = express.Router();
const Customergroup = require("../repositories/customergroup");
const { v4: uuid } = require("uuid");
const logger = require('../utils/logger');

router.use(requireAuth);

router.post("/addCustomergroup", async (req, res) => {
    const{ Customer_group}=req.body

    try{
        const check=await Customergroup.findOne({ Customer_group: Customer_group })

        if(check){
            return res.status(409).json({ success: false, message: "Customer group already exists" });
        }
        else{
          const newGroup = new Customergroup({
            Customer_group,
            Customer_group_uuid: uuid()
        });
        await newGroup.save();
        return res.status(201).json({ success: true, result: newGroup });
        }

    }
    catch(e){
      logger.error("Error saving group:", e);
      res.status(500).json({ success: false, message: e.message || "Server error" });
    }
  });



  router.get("/GetCustomergroupList", async (req, res) => {
    try {
      let data = await Customergroup.find({}).lean();

      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Customer_group) });
      else res.status(404).json({ success: false, message: "Customer Group Not found" });
    } catch (err) {
      logger.error("Error fetching group:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

  
  module.exports = router;