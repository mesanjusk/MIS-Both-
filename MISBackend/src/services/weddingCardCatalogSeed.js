const { v4: uuid } = require("uuid");
const RateCard = require("../repositories/rateCard");
const Items = require("../repositories/items");
const { WEDDING_CARD_SEED } = require("../data/weddingCardSeed");

const WEDDING_CARD_NAME = /^\s*wedding cards?\s*$/i;

async function findWeddingCardParent() {
  return RateCard.findOne({ itemName: WEDDING_CARD_NAME });
}

async function getOrCreateWeddingCardParent() {
  const existing = await findWeddingCardParent();
  if (existing) return existing;

  // Only one parent Rate Card record is created if none exists. The design
  // numbers themselves are embedded subcategory variants, never Item records.
  const masterItem = await Items.findOne({ Item_name: WEDDING_CARD_NAME }).lean();
  return RateCard.create({
    rateCard_uuid: uuid(),
    itemName: masterItem?.Item_name || "Wedding Card",
    itemUuid: masterItem?.Item_uuid || "",
    category: masterItem?.Item_group || "Wedding Card",
    pricingType: "per_piece",
    unit: "Nos",
    ratePerPiece: 0,
    isActive: true,
    weddingCardVariants: [],
  });
}

// Idempotent additive seed inside the existing RateCard collection. Preserves
// edits and tombstones; no Mongo collection creation or Items-master writes.
async function seedWeddingCardCatalog() {
  const parent = await getOrCreateWeddingCardParent();
  const existingCodes = new Set((parent.weddingCardVariants || [])
    .map((item) => `${item.brand}:${item.code}`));
  const missing = WEDDING_CARD_SEED.filter(({ brand, code }) => !existingCodes.has(`${brand}:${code}`))
    .map(({ brand, code, originalPrice, notes = "" }) => ({
      brand, code, originalPrice, notes,
      printingCharge: 0, packingCharge: 0, designCharge: 0, isDeleted: false,
    }));
  if (missing.length) {
    // Push only newly added code variants, retaining any edits/deletions.
    parent.weddingCardVariants.push(...missing);
    await parent.save();
  }
  return {
    inserted: missing.length,
    sourceEntries: WEDDING_CARD_SEED.length,
    parentRateCard: parent.rateCard_uuid,
  };
}
module.exports = { findWeddingCardParent, getOrCreateWeddingCardParent, seedWeddingCardCatalog };
