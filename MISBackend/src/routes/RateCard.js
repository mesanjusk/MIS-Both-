const express = require("express");
const { v4: uuid } = require("uuid");
const { requireAuth } = require("../middleware/auth");
const RateCard = require("../repositories/rateCard");
const Items = require("../repositories/items");
const Itemgroup = require("../repositories/itemgroup");
const logger = require("../utils/logger");

const router = express.Router();
router.use(requireAuth);

const PRICING_TYPES = ["per_sqft", "per_piece", "slab"];

const normalizeSlabs = (slabs = []) => {
  if (!Array.isArray(slabs)) return [];
  return slabs
    .map((row) => ({
      minQty: Number(row?.minQty ?? 0) || 0,
      maxQty: Number(row?.maxQty ?? 0) || 0,
      ratePerPiece: Number(row?.ratePerPiece ?? 0) || 0,
      flatPrice: Number(row?.flatPrice ?? 0) || 0,
    }))
    .filter((row) => row.minQty >= 0);
};

const buildPayload = (body = {}) => {
  const pricingType = PRICING_TYPES.includes(body.pricingType) ? body.pricingType : "per_piece";
  return {
    itemName: String(body.itemName || "").trim(),
    category: String(body.category || "").trim(),
    itemUuid: String(body.itemUuid || "").trim(),
    itemGroupUuid: String(body.itemGroupUuid || "").trim(),
    pricingType,
    unit: String(body.unit || "Nos").trim() || "Nos",
    ratePerSqft: Number(body.ratePerSqft ?? 0) || 0,
    minBillingSqft: Number(body.minBillingSqft ?? 0) || 0,
    ratePerPiece: Number(body.ratePerPiece ?? 0) || 0,
    minQty: Number(body.minQty ?? 1) || 0,
    slabs: normalizeSlabs(body.slabs),
    gstPercent: Number(body.gstPercent ?? 0) || 0,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    notes: String(body.notes || "").trim(),
  };
};

// When a rate card is linked to a real Item, pull its name/group from the
// Item and Item Group masters instead of letting itemName/category drift
// out of sync as separate free-text data.
const resolveItemLinkage = async (payload) => {
  if (!payload.itemUuid) return payload;
  const item = await Items.findOne({ Item_uuid: payload.itemUuid }).lean();
  if (!item) return payload;
  payload.itemName = item.Item_name;
  payload.category = item.Item_group || payload.category;
  const group = await Itemgroup.findOne({ Item_group: item.Item_group }).lean();
  payload.itemGroupUuid = group?.Item_group_uuid || "";
  return payload;
};

// List rate cards
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.active === "true") filter.isActive = true;
    const result = await RateCard.find(filter).sort({ category: 1, itemName: 1 }).lean();
    res.json({ success: true, result });
  } catch (err) {
    logger.error("Error fetching rate cards:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Get single rate card
router.get("/:id", async (req, res) => {
  try {
    const item = await RateCard.findOne({ rateCard_uuid: req.params.id }).lean();
    if (!item) return res.status(404).json({ success: false, message: "Rate card not found" });
    res.json({ success: true, result: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Create rate card
router.post("/", async (req, res) => {
  let payload = buildPayload(req.body);
  try {
    payload = await resolveItemLinkage(payload);
  } catch (err) {
    logger.error("Error resolving item linkage:", err);
  }
  if (!payload.itemName) {
    return res.status(400).json({ success: false, message: "itemName is required" });
  }
  try {
    const existing = await RateCard.findOne({ itemName: payload.itemName });
    if (existing) return res.status(409).json({ success: false, message: "A rate card for this item already exists" });

    const created = await RateCard.create({ ...payload, rateCard_uuid: uuid() });
    res.status(201).json({ success: true, result: created });
  } catch (err) {
    logger.error("Error creating rate card:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Update rate card
router.put("/:id", async (req, res) => {
  let payload = buildPayload(req.body);
  try {
    payload = await resolveItemLinkage(payload);
  } catch (err) {
    logger.error("Error resolving item linkage:", err);
  }
  if (!payload.itemName) {
    return res.status(400).json({ success: false, message: "itemName is required" });
  }
  try {
    const updated = await RateCard.findOneAndUpdate(
      { rateCard_uuid: req.params.id },
      { $set: payload },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ success: false, message: "Rate card not found" });
    res.json({ success: true, result: updated });
  } catch (err) {
    logger.error("Error updating rate card:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Delete rate card
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await RateCard.findOneAndDelete({ rateCard_uuid: req.params.id });
    if (!deleted) return res.status(404).json({ success: false, message: "Rate card not found" });
    res.json({ success: true, message: "Rate card deleted" });
  } catch (err) {
    logger.error("Error deleting rate card:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

module.exports = router;
