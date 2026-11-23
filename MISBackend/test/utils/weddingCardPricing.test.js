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

test("SKU variants are embedded on existing Item or legacy RateCard, not separate items", () => {
  const Items = require("../../src/repositories/items");
  const RateCard = require("../../src/repositories/rateCard");
  const variantsPath = Items.schema.path("weddingCardVariants");
  expect(RateCard.schema.path("weddingCardVariants")).toBeDefined();
  expect(variantsPath).toBeDefined();
  expect(variantsPath.schema.path("brand")).toBeDefined();
  expect(variantsPath.schema.path("originalPrice")).toBeDefined();
});

describe('Wedding Card order pricing: charges by correct unit', () => {
  const { calculateWeddingQuote, markUpPrice } = require('../../src/utils/weddingCardPricing');
  const record = { originalPrice: 20, markupPercent: 10, discountPercent: 0,
    printingCharge: 150, packingCharge: 50, designCharge: 200 };
  test('design applies once and print/pack apply per 100 cards', () => {
    expect(calculateWeddingQuote(record, 100)).toMatchObject({
      baseAmount: 2200, printingTotal: 150, packingTotal: 50,
      designTotal: 200, amount: 2600
    });
    expect(calculateWeddingQuote(record, 200)).toMatchObject({
      baseAmount: 4400, printingTotal: 300, packingTotal: 100,
      designTotal: 200, amount: 5000
    });
    expect(calculateWeddingQuote(record, 150)).toMatchObject({
      baseAmount: 3300, printingTotal: 225, packingTotal: 75,
      designTotal: 200, amount: 3800
    });
  });
  test('per-100 printing and packing are prorated with smaller orders', () => {
    expect(calculateWeddingQuote(record, 25)).toMatchObject({
      printingTotal: 37.5, packingTotal: 12.5,
      designTotal: 200, amount: 800
    });
  });
  test('markup and discount can be set per code or changed for one quote', () => {
    expect(markUpPrice(17.5, 10)).toBe(19.25);
    expect(markUpPrice(17.5, 20)).toBe(21);
    expect(calculateWeddingQuote(record, 100, { markupPercent: 20, discountPercent: 10 }))
      .toMatchObject({ markedUpUnitPrice: 24, discountedUnitPrice: 21.6,
        baseAmount: 2160, amount: 2560 });
  });
  test('invalid quantities and percent inputs are rejected', () => {
    expect(calculateWeddingQuote(record, 0).error).toBeTruthy();
    expect(calculateWeddingQuote(record, 1.5).error).toBeTruthy();
    expect(calculateWeddingQuote(record, 50, { discountPercent: 105 }).error).toBeTruthy();
  });
});
