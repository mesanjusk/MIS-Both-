const express = require("express");
const router = express.Router();
const Usergroup = require("../repositories/usergroup");
const { v4: uuid } = require("uuid");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/authorize");

router.use(requireAuth);

router.post(
  "/addUsergroup",
  asyncHandler(async (req, res) => {
    const { User_group } = req.body;

    const check = await Usergroup.findOne({ User_group });
    if (check) {
      return res.status(409).json({ success: false, message: "User group already exists" });
    }

    const newGroup = new Usergroup({
      User_group,
      User_group_uuid: uuid(),
    });

    await newGroup.save();
    res.status(201).json({ success: true, result: newGroup });
  })
);

router.get(
  "/GetUsergroupList",
  asyncHandler(async (_req, res) => {
    const data = await Usergroup.find({}).lean();

    if (!data.length) {
      throw new AppError("User Group Not found", 200);
    }

    res.json({ success: true, result: data.filter((a) => a.User_group) });
  })
);

router.get(
  "/getGroup/:userGroup",
  asyncHandler(async (req, res) => {
    const userGroup = req.params.userGroup;

    const group = await Usergroup.findOne({ User_group: userGroup });

    if (!group) {
      throw new AppError("User Group not found!", 404);
    }

    res.status(200).json({ success: true, group });
  })
);

// Sets the whole business's default WhatsApp-order-command permissions for
// everyone in this group — the group-level control the per-user permission
// screen couldn't offer (until now, granting a right meant ticking a box on
// every individual in the group, one at a time).
router.put(
  "/updateUsergroupPermissions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { viewOrders, advanceOrderStage, assignOrders, createOrders, receivePayments } = req.body || {};

    const modulePermissions = {};
    if (typeof viewOrders === "boolean") modulePermissions.viewOrders = viewOrders;
    if (typeof advanceOrderStage === "boolean") modulePermissions.advanceOrderStage = advanceOrderStage;
    if (typeof assignOrders === "boolean") modulePermissions.assignOrders = assignOrders;
    if (typeof createOrders === "boolean") modulePermissions.createOrders = createOrders;
    if (typeof receivePayments === "boolean") modulePermissions.receivePayments = receivePayments;

    const filter = /^[0-9a-fA-F]{24}$/.test(id) ? { _id: id } : { User_group_uuid: id };
    const group = await Usergroup.findOneAndUpdate(
      filter,
      { $set: { modulePermissions } },
      { new: true }
    );

    if (!group) {
      throw new AppError("User Group not found!", 404);
    }

    res.status(200).json({ success: true, result: group });
  })
);

module.exports = router;
