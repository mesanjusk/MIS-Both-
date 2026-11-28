const { v4: uuid } = require("uuid");
const RateCard = require("../repositories/rateCard");
const Items = require("../repositories/items");
const { WEDDING_CARD_SEED } = require("../data/weddingCardSeed");
const { initialSubcategories } = require("../utils/weddingCardSubcategories");

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

// Import the built-in M/K catalog only once. Later renames/removals must not
// silently recreate SK(M)/SK(K) or the removed card codes after restart.
async function seedWeddingCardCatalog() {
  const parent = await getOrCreateWeddingCardParent();
  if (parent.weddingCardCatalogInitialized) {
    return {
      inserted: 0, sourceEntries: WEDDING_CARD_SEED.length,
      parentItem: parent.Item_uuid || parent.rateCard_uuid, alreadyInitialized: true,
    };
  }
  const existingCodes = new Set((parent.weddingCardVariants || [])
    .map(item => `${item.brand}:${item.code}`));
  const missing = WEDDING_CARD_SEED
    .filter(({ brand, code }) => !existingCodes.has(`${brand}:${code}`))
    .map(({ brand, code, originalPrice, notes = "" }) => ({
      brand, code, originalPrice, notes, isDeleted: false,
      printingCharge: 0, packingCharge: 0, designCharge: 0,
    }));
  parent.weddingCardVariants.push(...missing);
  parent.weddingCardSubcategories = initialSubcategories(parent.weddingCardVariants);
  parent.weddingCardCatalogInitialized = true;
  await parent.save();
  return {
    inserted: missing.length, sourceEntries: WEDDING_CARD_SEED.length,
    parentItem: parent.Item_uuid || parent.rateCard_uuid,
  };
}
module.exports = { findWeddingCardParent, getOrCreateWeddingCardParent, seedWeddingCardCatalog };
