const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireAdminOrOwner } = require("../middleware/authorize");
const { findWeddingCardParent, getOrCreateWeddingCardParent } = require("../services/weddingCardCatalogSeed");
const { roundMoney, withCalculatedPrices } = require("../utils/weddingCardPricing");
const logger = require("../utils/logger");

const router = express.Router();
router.use(requireAuth);

const isBrand = (value) => value === "M" || value === "K";
const isCode = (value) => /^\d{3,5}$/.test(String(value ?? ""));
const findVariant = (parent, brand, code) =>
  (parent?.weddingCardVariants || []).find((item) => item.brand === brand && item.code === code);

const optionalAmount = (body, name, fallback) => {
  if (!(name in body)) return fallback;
  const n = Number(body[name]);
  if (body[name] === "" || body[name] === null || !Number.isFinite(n) || n < 0 || n > 10000000) {
    throw new Error(`${name} must be a nonnegative amount`);
  }
  return roundMoney(n);
};
const writableFields = (body, existing = null) => ({
  originalPrice: optionalAmount(body, "originalPrice", existing?.originalPrice),
  printingCharge: optionalAmount(body, "printingCharge", existing?.printingCharge ?? 0),
  packingCharge: optionalAmount(body, "packingCharge", existing?.packingCharge ?? 0),
  designCharge: optionalAmount(body, "designCharge", existing?.designCharge ?? 0),
  notes: "notes" in body ? String(body.notes || "").slice(0, 500) : (existing?.notes || ""),
});

router.get("/", async (req, res) => {
  try {
    const brand = String(req.query.brand || "").toUpperCase();
    if (brand && !isBrand(brand)) return res.status(400).json({ success: false, message: "Unknown Wedding Card subcategory" });
    const parent = await findWeddingCardParent();
    const records = (parent?.weddingCardVariants || []).filter((item) =>
      !item.isDeleted && (!brand || item.brand === brand)
    ).map((item) => item.toObject());
    records.sort((a, b) => a.brand.localeCompare(b.brand) || Number(a.code) - Number(b.code));
    return res.json({ success: true, result: records.map(withCalculatedPrices) });
  } catch (err) {
    logger.error({ err }, "Wedding Card rates fetch failed");
    return res.status(500).json({ success: false, message: "Unable to load Wedding Card rates" });
  }
});

router.post("/", requireAdminOrOwner, async (req, res) => {
  const brand = String(req.body?.brand || "").toUpperCase();
  const code = String(req.body?.code ?? "").trim();
  if (!isBrand(brand) || !isCode(code)) {
    return res.status(400).json({ success: false, message: "Choose SK (M) or SK (K), with a numeric 3-5 digit code" });
  }
  try {
    const fields = writableFields(req.body);
    if (fields.originalPrice === undefined) return res.status(400).json({ success: false, message: "Original price required" });
    const parent = await getOrCreateWeddingCardParent();
    const existing = findVariant(parent, brand, code);
    if (existing && !existing.isDeleted) {
      return res.status(409).json({ success: false, message: "This code already exists in the subcategory" });
    }
    if (existing) {
      existing.set({ ...fields, isDeleted: false });
    } else {
      parent.weddingCardVariants.push({ brand, code, ...fields, isDeleted: false });
    }
    await parent.save();
    const record = findVariant(parent, brand, code);
    return res.status(201).json({ success: true, result: withCalculatedPrices(record.toObject()) });
  } catch (err) {
    if (err.message?.includes("must be a nonnegative")) return res.status(400).json({ success: false, message: err.message });
    logger.error({ err }, "Wedding Card code create failed");
    return res.status(500).json({ success: false, message: "Unable to add Wedding Card code" });
  }
});

router.put("/:brand/:code", requireAdminOrOwner, async (req, res) => {
  const brand = String(req.params.brand || "").toUpperCase();
  const code = req.params.code;
  if (!isBrand(brand) || !isCode(code)) return res.status(400).json({ success: false, message: "Invalid Wedding Card code" });
  try {
    const parent = await findWeddingCardParent();
    const record = findVariant(parent, brand, code);
    if (!record || record.isDeleted) return res.status(404).json({ success: false, message: "Wedding Card code not found" });
    record.set(writableFields(req.body, record));
    await parent.save();
    return res.json({ success: true, result: withCalculatedPrices(record.toObject()) });
  } catch (err) {
    if (err.message?.includes("must be a nonnegative")) return res.status(400).json({ success: false, message: err.message });
    logger.error({ err }, "Wedding Card code update failed");
    return res.status(500).json({ success: false, message: "Unable to update Wedding Card code" });
  }
});

router.delete("/:brand/:code", requireAdminOrOwner, async (req, res) => {
  const brand = String(req.params.brand || "").toUpperCase();
  const code = req.params.code;
  if (!isBrand(brand) || !isCode(code)) return res.status(400).json({ success: false, message: "Invalid Wedding Card code" });
  try {
    const parent = await findWeddingCardParent();
    const record = findVariant(parent, brand, code);
    if (!record || record.isDeleted) return res.status(404).json({ success: false, message: "Wedding Card code not found" });
    record.isDeleted = true;
    await parent.save();
    return res.json({ success: true, message: "Wedding Card code deleted" });
  } catch (err) {
    logger.error({ err }, "Wedding Card code delete failed");
    return res.status(500).json({ success: false, message: "Unable to delete Wedding Card code" });
  }
});

module.exports = router;
