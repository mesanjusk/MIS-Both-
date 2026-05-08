const { requireAuth } = require('../middleware/auth');
const express = require("express");
const router = express.Router();
const Itemgroup = require("../repositories/itemgroup");
const { v4: uuid } = require("uuid");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

router.use(requireAuth);

router.post(
  "/addItemgroup",
  asyncHandler(async (req, res) => {
    const {
      Item_group,
      groupType = "general",
      description = "",
      defaultItemType = "finished_item",
      stockTrackedDefault = false,
    } = req.body;

    const existingGroup = await Itemgroup.findOne({ Item_group });
    if (existingGroup) return res.status(409).json({ success: false, message: "Item group already exists" });

    const newGroup = new Itemgroup({
      Item_group,
      Item_group_uuid: uuid(),
      groupType,
      description: String(description || "").trim(),
      defaultItemType,
      stockTrackedDefault: Boolean(stockTrackedDefault),
    });

    await newGroup.save();
    res.status(201).json({ success: true, result: newGroup });
  })
);

router.get(
  "/GetItemgroupList",
  asyncHandler(async (_req, res) => {
    const data = await Itemgroup.find({}).sort({ Item_group: 1 });
    if (!data.length) throw new AppError("Item Group Not found", 200);
    res.json({ success: true, result: data.filter((a) => a.Item_group) });
  })
);

module.exports = router;
