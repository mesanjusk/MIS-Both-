const { v4: uuid } = require("uuid");
const RateCard = require("../repositories/rateCard");
const Items = require("../repositories/items");
const { WEDDING_CARD_SEED } = require("../data/weddingCardSeed");

const WEDDING_CARD_NAME = /^\s*wedding cards?\s*$/i;

async function findWeddingCardParent() {
  // Prefer the actual Wedding Card Item master, not a separate Rate Card/SKU.
  const direct = await Items.findOne({ Item_name: WEDDING_CARD_NAME });
  if (direct) return direct;
  const existingItem = await Items.findOne({ Item_name: /wedding\s*cards?/i });
  if (existingItem) return existingItem;
  // Compatibility fallback if a legacy Wedding Card Rate Card already exists.
  return RateCard.findOne({ itemName: WEDDING_CARD_NAME });
}

async function getOrCreateWeddingCardParent() {
  const existing = await findWeddingCardParent();
  if (existing) return existing;

  // Only ONE Wedding Card master Item is created if truly absent; all designs
  // live inside it. Items collection already exists in the running MIS.
  return Items.create({
    Item_uuid: uuid(),
    Item_name: "Wedding Card",
    Item_group: "Wedding Card",
    itemType: "finished_item",
    unit: "Nos",
    weddingCardVariants: [],
  });
}

// Idempotent additive seed inside existing Items (or legacy RateCard) collection. Preserves
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
    parentItem: parent.Item_uuid || parent.rateCard_uuid,
  };
}
module.exports = { findWeddingCardParent, getOrCreateWeddingCardParent, seedWeddingCardCatalog };
