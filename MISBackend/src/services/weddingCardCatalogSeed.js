const WeddingCardRate = require("../repositories/weddingCardRate");
const { WEDDING_CARD_SEED } = require("../data/weddingCardSeed");

// Add missing catalogue variants only. Admin edits, extra charges and soft
// deletions are deliberately preserved across every restart/deployment.
async function seedWeddingCardCatalog() {
  const operations = WEDDING_CARD_SEED.map(({ brand, code, originalPrice, notes = "" }) => ({
    updateOne: {
      filter: { _id: `${brand}:${code}` },
      update: { $setOnInsert: {
        _id: `${brand}:${code}`, brand, code, originalPrice, notes,
        printingCharge: 0, packingCharge: 0, designCharge: 0, isDeleted: false,
      } },
      upsert: true,
    },
  }));
  if (operations.length === 0) return { inserted: 0 };
  const result = await WeddingCardRate.bulkWrite(operations, { ordered: false });
  return { inserted: result.upsertedCount || 0, sourceEntries: operations.length };
}
module.exports = { seedWeddingCardCatalog };
