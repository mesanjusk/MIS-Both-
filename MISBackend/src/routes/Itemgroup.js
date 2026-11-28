const { requireAuth } = require('../middleware/auth');
const express = require("express");
const router = express.Router();
const Itemgroup = require("../repositories/itemgroup");
const { v4: uuid } = require("uuid");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

router.use(requireAuth);

const Items = require("../repositories/items");
const RateCard = require("../repositories/rateCard");
const { requireAdminOrOwner } = require("../middleware/authorize");
const { normalizeCategoryName, categoryNameError, nameRegex } = require("../utils/rateCategory");

// Rate Calculator categories reuse existing Item Group storage. This creates
// NO new MongoDB collection and does not create an Items-master product.
router.get("/rate-categories", requireAdminOrOwner, asyncHandler(async (_req, res) => {
  const [groups, itemCounts, rateCounts] = await Promise.all([
    Itemgroup.find({ Item_group: { $exists: true, $ne: "" } }).lean(),
    Items.aggregate([{ $match: { Item_group: { $nin: ["", null] } } },
      { $group: { _id: "$Item_group", count: { $sum: 1 } } }]),
    RateCard.aggregate([{ $match: { category: { $nin: ["", null] } } },
      { $group: { _id: "$category", count: { $sum: 1 } } }]),
  ]);
  const countMap = items => new Map(items.map(x => [String(x._id).toLowerCase(), x.count]));
  const itemsByName = countMap(itemCounts);
  const ratesByName = countMap(rateCounts);
  const categories = groups.map(g => ({
    uuid: g.Item_group_uuid,
    name: g.Item_group,
    parentUuid: g.parentGroup_uuid || "",
    parentName: g.parentGroup || "",
    itemCount: itemsByName.get(g.Item_group.toLowerCase()) || 0,
    rateCardCount: ratesByName.get(g.Item_group.toLowerCase()) || 0,
    childCount: groups.filter(c => c.parentGroup_uuid === g.Item_group_uuid).length,
    managed: true,
  }));
  const existingNames = new Set(categories.map(g => g.name.toLowerCase()));
  // Some older Rate Cards refer to ad-hoc category names not in Item Groups.
  // Keep them visible; administrators can register them before renaming.
  for (const row of rateCounts) {
    const name = String(row._id || "").trim();
    if (!name || existingNames.has(name.toLowerCase())) continue;
    categories.push({ uuid: null, name, parentUuid: "", parentName: "",
      itemCount: itemsByName.get(name.toLowerCase()) || 0,
      rateCardCount: row.count, childCount: 0, managed: false });
    existingNames.add(name.toLowerCase());
  }
  categories.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, result: categories });
}));

router.post("/rate-categories", requireAdminOrOwner, asyncHandler(async (req, res) => {
  const name = normalizeCategoryName(req.body?.name);
  const err = categoryNameError(name);
  if (err) return res.status(400).json({ success: false, message: err });
  if (await Itemgroup.exists({ Item_group: nameRegex(name) })) {
    return res.status(409).json({ success: false, message: "Category already exists" });
  }
  const group = await Itemgroup.create({
    Item_group: name, Item_group_uuid: uuid(), groupType: "general",
    description: "Rate Calculator category",
    defaultItemType: "finished_item", stockTrackedDefault: false,
  });
  res.status(201).json({ success: true, result: { uuid: group.Item_group_uuid, name: group.Item_group } });
}));

router.put("/rate-categories/:uuid", requireAdminOrOwner, asyncHandler(async (req, res) => {
  const id = String(req.params.uuid || "");
  const name = normalizeCategoryName(req.body?.name);
  const err = categoryNameError(name);
  if (err) return res.status(400).json({ success: false, message: err });
  const group = await Itemgroup.findOne({ Item_group_uuid: id });
  if (!group) return res.status(404).json({ success: false, message: "Category not found" });
  const previous = group.Item_group;
  if (previous === name) return res.json({ success: true, result: { uuid: id, name, changed: false } });
  if (await Itemgroup.exists({ Item_group: nameRegex(name), Item_group_uuid: { $ne: id } })) {
    return res.status(409).json({ success: false, message: "Category name already exists" });
  }

  // Rename all references, not item/product names, so the existing rate
  // calculator and item master remain consistent with the shared category.
  // The source group is updated last to avoid advertising a new category
  // before its linked rows have been renamed.
  const oldName = nameRegex(previous);
  await Items.updateMany({ Item_group: oldName }, { $set: { Item_group: name } });
  await RateCard.updateMany({ category: oldName }, { $set: { category: name } });
  await Itemgroup.updateMany({ parentGroup_uuid: id }, { $set: { parentGroup: name } });
  group.Item_group = name;
  await group.save();
  res.json({ success: true, result: { uuid: id, name, previous, changed: true } });
}));

router.delete("/rate-categories/:uuid", requireAdminOrOwner, asyncHandler(async (req, res) => {
  const id = String(req.params.uuid || "");
  const group = await Itemgroup.findOne({ Item_group_uuid: id }).lean();
  if (!group) return res.status(404).json({ success: false, message: "Category not found" });
  const ref = nameRegex(group.Item_group);
  const [items, rateCards, children] = await Promise.all([
    Items.countDocuments({ Item_group: ref }),
    RateCard.countDocuments({ category: ref }),
    Itemgroup.countDocuments({ parentGroup_uuid: id }),
  ]);
  if (items || rateCards || children) {
    return res.status(409).json({ success: false,
      message: "Category is in use (" + items + " items, " + rateCards +
        " rate cards, " + children + " subcategories). Move or reassign them before deleting." });
  }
  await Itemgroup.deleteOne({ Item_group_uuid: id });
  res.json({ success: true, message: "Unused category deleted" });
}));

router.post(
  "/addItemgroup",
  asyncHandler(async (req, res) => {
    const {
      Item_group,
      groupType = "general",
      description = "",
      defaultItemType = "finished_item",
      stockTrackedDefault = false,
      parentGroup_uuid = "",
    } = req.body;

    const existingGroup = await Itemgroup.findOne({ Item_group });
    if (existingGroup) return res.status(409).json({ success: false, message: "Item group already exists" });

    let parentGroup = "";
    if (parentGroup_uuid) {
      const parent = await Itemgroup.findOne({ Item_group_uuid: parentGroup_uuid });
      if (!parent) return res.status(400).json({ success: false, message: "Parent group not found" });
      if (parent.parentGroup_uuid) {
        return res.status(400).json({ success: false, message: "Cannot nest a sub group under another sub group" });
      }
      parentGroup = parent.Item_group;
    }

    const newGroup = new Itemgroup({
      Item_group,
      Item_group_uuid: uuid(),
      groupType,
      description: String(description || "").trim(),
      defaultItemType,
      stockTrackedDefault: Boolean(stockTrackedDefault),
      parentGroup_uuid: String(parentGroup_uuid || "").trim(),
      parentGroup,
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
