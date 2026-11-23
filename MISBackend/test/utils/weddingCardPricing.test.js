const { encodePrice, markUpTenPercent, withCalculatedPrices } = require("../../src/utils/weddingCardPricing");
const { WEDDING_CARD_SEED } = require("../../src/data/weddingCardSeed");
test("the source catalogue contains unique Wedding Card variants in both subcategories", () => {
  expect(WEDDING_CARD_SEED.length).toBe(272);
  expect(WEDDING_CARD_SEED.filter((r) => r.brand === "M")).toHaveLength(147);
  expect(WEDDING_CARD_SEED.filter((r) => r.brand === "K")).toHaveLength(125);
  expect(new Set(WEDDING_CARD_SEED.map((r) => r.brand + ":" + r.code)).size).toBe(WEDDING_CARD_SEED.length);
});
test("supplier price is encoded without Rs or trailing /-", () => {
  expect(encodePrice(1200)).toBe("NAYY");
  expect(encodePrice(7000)).toBe("CYYY");
  expect(encodePrice(17.5)).toBe("NC.U");
});
test("markup preserves exact paise on small values", () => {
  expect(markUpTenPercent(11)).toBe(12.1);
  expect(markUpTenPercent(17.5)).toBe(19.25);
  expect(markUpTenPercent(1200)).toBe(1320);
});
test("printing packing design charges add to marked up price", () => {
  expect(withCalculatedPrices({ originalPrice: 550, printingCharge: 3.5, packingCharge: 2, designCharge: 6 })).toMatchObject({
    codedPrice: "UUY", updatedPrice: 605, finalRate: 616.5
  });
});

test("SKU variants are embedded on RateCard instead of creating their own collection", () => {
  const RateCard = require("../../src/repositories/rateCard");
  const variantsPath = RateCard.schema.path("weddingCardVariants");
  expect(variantsPath).toBeDefined();
  expect(variantsPath.schema.path("brand")).toBeDefined();
  expect(variantsPath.schema.path("originalPrice")).toBeDefined();
});
