const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireAdminOrOwner } = require("../middleware/authorize");
const { tierFor } = require("../utils/roleHierarchy");
const { createUpload, limitRequestSize, MB } = require("../middleware/uploadLimits");
const cloudinary = require("../utils/cloudinary");
const { findWeddingCardParent, getOrCreateWeddingCardParent } = require("../services/weddingCardCatalogSeed");
const { roundMoney, withCalculatedPrices, calculateWeddingQuote, calculateWeddingBreakdown, encodePrice } = require("../utils/weddingCardPricing");
const logger = require("../utils/logger");

const router = express.Router();
router.use(requireAuth);
const canEdit = (req) => tierFor(req.user?.userGroup) >= 4;
const isBrand = (value) => value === "M" || value === "K";
const isCode = (value) => /^\d{3,5}$/.test(String(value ?? ""));
const fieldLimits = {
  originalPrice: 10000000, printingCharge: 10000000,
  packingCharge: 10000000, designCharge: 10000000,
  markupPercent: 1000, discountPercent: 100,
};
const findVariant = (parent, brand, code) =>
  (parent?.weddingCardVariants || []).find(item => item.brand === brand && item.code === code);
const invalidAmount = (body, name, upper) => {
  const value = body[name];
  return value == null || value === "" || !Number.isFinite(Number(value)) ||
    Number(value) < 0 || Number(value) > upper;
};
const normalizeChanges = (body = {}, existing = {}, { optional = false } = {}) => {
  const changes = {};
  for (const [name, upper] of Object.entries(fieldLimits)) {
    if (!(name in body)) {
      if (!optional && name === "originalPrice" && existing.originalPrice == null) {
        throw new Error("Original price required");
      }
      continue;
    }
    if (invalidAmount(body, name, upper)) throw new Error(`${name} must be between 0 and ${upper}`);
    changes[name] = roundMoney(Number(body[name]));
  }
  if ("notes" in body && !optional) changes.notes = String(body.notes || "").slice(0, 500);
  return changes;
};
const summary = (row) => ({
  brand: row.brand, code: row.code,
  imageUrl: row.images?.[0]?.url || row.imageUrl || "",
  imageCount: row.images?.length || (row.imageUrl ? 1 : 0),
});
const handleError = (res, err, label) => {
  if (/^(Original price required|\w+ must be between)/.test(err.message)) {
    return res.status(400).json({ success: false, message: err.message });
  }
  logger.error({ err }, label);
  return res.status(500).json({ success: false, message: "Unable to process Wedding Card request" });
};

router.get("/", async (req, res) => {
  try {
    const brand = String(req.query.brand || "").toUpperCase();
    if (brand && !isBrand(brand)) return res.status(400).json({ success: false, message: "Unknown subcategory" });
    const parent = await findWeddingCardParent();
    const records = (parent?.weddingCardVariants || []).filter(row => !row.isDeleted && (!brand || row.brand === brand))
      .map(row => row.toObject());
    records.sort((a, b) => a.brand.localeCompare(b.brand) || Number(a.code) - Number(b.code));
    // Staff can search all product codes but never receives supplier prices or charge breakdown.
    return res.json({ success: true, result: canEdit(req) ? records.map(withCalculatedPrices) : records.map(summary) });
  } catch (err) {
    return handleError(res, err, "Wedding Card list failed");
  }
});

// The search screen gets ONLY the final quote amount; nothing about costs, code mapping
// or internal margin is returned to a regular staff member.
router.get("/quote", async (req, res) => {
  const brand = String(req.query.brand || "").toUpperCase();
  const code = String(req.query.code || "");
  const qty = Number(req.query.qty);
  if (!isBrand(brand) || !isCode(code) || !Number.isSafeInteger(qty) || qty < 1 || qty > 1000000) {
    return res.status(400).json({ success: false, message: "Choose valid card number and quantity" });
  }
  const overrides = {};
  const custom = req.query.markupPercent != null || req.query.discountPercent != null;
  if (custom && !canEdit(req)) return res.status(403).json({ success: false, message: "Only admins can override price percentages" });
  for (const field of ["markupPercent", "discountPercent"]) {
    if (req.query[field] == null) continue;
    if (invalidAmount(req.query, field, fieldLimits[field])) {
      return res.status(400).json({ success: false, message: "Invalid " + field });
    }
    overrides[field] = Number(req.query[field]);
  }
  try {
    const parent = await findWeddingCardParent();
    const row = findVariant(parent, brand, code);
    if (!row || row.isDeleted) return res.status(404).json({ success: false, message: "Wedding Card not found" });
    const calculated = calculateWeddingQuote(row, qty, overrides);
    if (calculated.error) return res.status(400).json({ success: false, message: calculated.error });
    const extra = canEdit(req) ? {
      codedPrice: encodePrice(row.originalPrice),
      breakdown: calculateWeddingBreakdown(row, qty, overrides),
    } : {};
    return res.json({
      success: true,
      result: { ...summary(row), qty, amount: calculated.amount, unit: "Nos", ...extra },
    });
  } catch (err) {
    return handleError(res, err, "Wedding Card quote failed");
  }
});

router.post("/", requireAdminOrOwner, async (req, res) => {
  const brand = String(req.body?.brand || "").toUpperCase();
  const code = String(req.body?.code || "").trim();
  if (!isBrand(brand) || !isCode(code)) return res.status(400).json({ success: false, message: "Choose subcategory and 3–5 digit number" });
  try {
    const changes = normalizeChanges(req.body);
    const parent = await getOrCreateWeddingCardParent();
    const existing = findVariant(parent, brand, code);
    if (existing && !existing.isDeleted) return res.status(409).json({ success: false, message: "This code already exists" });
    if (existing) existing.set({ ...changes, isDeleted: false });
    else parent.weddingCardVariants.push({ brand, code, ...changes, isDeleted: false });
    await parent.save();
    return res.status(201).json({ success: true, result: withCalculatedPrices(findVariant(parent, brand, code).toObject()) });
  } catch (err) { return handleError(res, err, "Wedding Card create failed"); }
});

// Bulk edits are restricted to explicit selected codes, never all items by accident.
router.patch("/bulk", requireAdminOrOwner, async (req, res) => {
  const codes = req.body?.codes;
  const changes = req.body?.changes;
  const mode = req.body?.mode || "set";
  if (!Array.isArray(codes) || codes.length < 1 || codes.length > 500 || !["set", "add"].includes(mode) ||
      !changes || typeof changes !== "object" || Array.isArray(changes)) {
    return res.status(400).json({ success: false, message: "Select 1–500 codes, fields and a valid operation" });
  }
  if (!Object.keys(changes).length || Object.keys(changes).some(k => !Object.hasOwn(fieldLimits, k))) {
    return res.status(400).json({ success: false, message: "Choose permitted pricing fields only" });
  }
  const ids = codes.map(item => ({ brand: String(item.brand || "").toUpperCase(), code: String(item.code || "") }));
  if (ids.some(item => !isBrand(item.brand) || !isCode(item.code)) ||
      new Set(ids.map(item => item.brand + ":" + item.code)).size !== ids.length) {
    return res.status(400).json({ success: false, message: "Duplicate or invalid selection" });
  }
  try {
    const normalized = normalizeChanges(changes, {}, { optional: true });
    const parent = await findWeddingCardParent();
    if (!parent) return res.status(404).json({ success: false, message: "Wedding Card item not found" });
    const chosen = ids.map(item => findVariant(parent, item.brand, item.code));
    if (chosen.some(row => !row || row.isDeleted)) {
      return res.status(409).json({ success: false, message: "Some selected codes no longer exist. Refresh first." });
    }
    const planned = chosen.map(row => {
      const output = {};
      for (const [name, value] of Object.entries(normalized)) {
        output[name] = mode === "add" ? roundMoney((Number(row[name]) || 0) + value) : value;
        if (output[name] < 0 || output[name] > fieldLimits[name]) {
          throw new Error(`${name} must be between 0 and ${fieldLimits[name]}`);
        }
      }
      return output;
    });
    chosen.forEach((row, idx) => row.set(planned[idx]));
    await parent.save();
    return res.json({ success: true, result: { updated: chosen.length } });
  } catch (err) { return handleError(res, err, "Wedding Card bulk edit failed"); }
});

router.put("/:brand/:code", requireAdminOrOwner, async (req, res) => {
  const brand = String(req.params.brand || "").toUpperCase();
  const code = req.params.code;
  if (!isBrand(brand) || !isCode(code)) return res.status(400).json({ success: false, message: "Invalid code" });
  try {
    const parent = await findWeddingCardParent();
    const row = findVariant(parent, brand, code);
    if (!row || row.isDeleted) return res.status(404).json({ success: false, message: "Code not found" });
    row.set(normalizeChanges(req.body, row));
    await parent.save();
    return res.json({ success: true, result: withCalculatedPrices(row.toObject()) });
  } catch (err) { return handleError(res, err, "Wedding Card update failed"); }
});

// Uploaded images live in existing Cloudinary account, with only URLs/IDs embedded
// on the Wedding Card item; no new MongoDB collection.
const uploadImage = createUpload({
  maxFileBytes: 5 * MB, maxFiles: 1,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
});
const uploadToCloudinary = (buffer, brand, code) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: `misboth/wedding-cards/${brand}/${code}`, resource_type: "image", overwrite: false },
    (err, result) => err ? reject(err) : resolve(result)
  );
  stream.end(buffer);
});
router.post("/:brand/:code/images", requireAdminOrOwner, limitRequestSize(6 * MB), uploadImage.single("file"), async (req, res) => {
  const brand = String(req.params.brand || "").toUpperCase();
  const code = req.params.code;
  if (!isBrand(brand) || !isCode(code)) return res.status(400).json({ success: false, message: "Invalid code" });
  if (!req.file) return res.status(400).json({ success: false, message: "Choose JPEG, PNG or WebP image (max 5MB)" });
  let uploadResult = null;
  try {
    const parent = await findWeddingCardParent();
    const row = findVariant(parent, brand, code);
    if (!row || row.isDeleted) return res.status(404).json({ success: false, message: "Card not found" });
    if ((row.images || []).length >= 6) return res.status(409).json({ success: false, message: "Maximum six photos per card" });
    uploadResult = await uploadToCloudinary(req.file.buffer, brand, code);
    row.images.push({ url: uploadResult.secure_url, publicId: uploadResult.public_id });
    await parent.save();
    return res.status(201).json({ success: true, result: { images: row.images.map(x => ({ url: x.url })) } });
  } catch (err) {
    if (uploadResult?.public_id) await cloudinary.uploader.destroy(uploadResult.public_id).catch(() => {});
    return handleError(res, err, "Wedding Card image upload failed");
  }
});
router.delete("/:brand/:code/images/:index", requireAdminOrOwner, async (req, res) => {
  const brand = String(req.params.brand || "").toUpperCase();
  const code = req.params.code;
  const index = Number(req.params.index);
  if (!isBrand(brand) || !isCode(code) || !Number.isSafeInteger(index) || index < 0) {
    return res.status(400).json({ success: false, message: "Invalid photo selection" });
  }
  try {
    const parent = await findWeddingCardParent();
    const row = findVariant(parent, brand, code);
    if (!row || row.isDeleted || !row.images?.[index]) return res.status(404).json({ success: false, message: "Photo not found" });
    const [removed] = row.images.splice(index, 1);
    await parent.save();
    // A failed Cloudinary delete doesn't reinstate the photo in the catalogue.
    if (removed.publicId) await cloudinary.uploader.destroy(removed.publicId).catch(err =>
      logger.warn({ err, publicId: removed.publicId }, "Cloudinary cleanup failed")
    );
    return res.json({ success: true, result: { images: row.images.map(x => ({ url: x.url })) } });
  } catch (err) { return handleError(res, err, "Wedding Card image removal failed"); }
});

router.delete("/:brand/:code", requireAdminOrOwner, async (req, res) => {
  const brand = String(req.params.brand || "").toUpperCase();
  const code = req.params.code;
  if (!isBrand(brand) || !isCode(code)) return res.status(400).json({ success: false, message: "Invalid code" });
  try {
    const parent = await findWeddingCardParent();
    const row = findVariant(parent, brand, code);
    if (!row || row.isDeleted) return res.status(404).json({ success: false, message: "Code not found" });
    row.isDeleted = true;
    await parent.save();
    return res.json({ success: true, message: "Card code removed" });
  } catch (err) { return handleError(res, err, "Wedding Card delete failed"); }
});

module.exports = router;
