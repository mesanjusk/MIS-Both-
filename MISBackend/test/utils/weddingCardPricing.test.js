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
test("only actual quoted quantity includes batch and one-time charges", () => {
  expect(withCalculatedPrices({ originalPrice: 550, printingCharge: 3.5, packingCharge: 2, designCharge: 6 })).toMatchObject({
    codedPrice: "UUY", updatedPrice: 605, finalRate: 605, hundredTotal: 60511.5
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

describe('admin break-even estimate for Wedding Cards', () => {
  const { calculateWeddingBreakdown } = require('../../src/utils/weddingCardPricing');
  const costs = {
    originalPrice: 20, markupPercent: 10, discountPercent: 0,
    printingCharge: 150, packingCharge: 50, designCharge: 200,
  };
  test('separates supplier, printing, packing and one-time design', () => {
    const row = calculateWeddingBreakdown(costs, 200);
    expect(row).toMatchObject({
      supplierUnitPrice: 20, supplierTotal: 4000,
      printingRatePer100: 150, printingTotal: 300,
      packingRatePer100: 50, packingTotal: 100,
      designChargeOnce: 200, designTotal: 200,
      cardSellingTotal: 4400, amount: 5000,
      estimatedRecoveryTotal: 4600, estimatedBreakEvenUnit: 23,
      estimatedContribution: 400
    });
  });
  test('estimates correct design cost per card for a small order', () => {
    const row = calculateWeddingBreakdown(costs, 25);
    expect(row.estimatedRecoveryTotal).toBe(750);
    expect(row.estimatedBreakEvenUnit).toBe(30);
    expect(row.amount).toBe(800);
  });
  test('preserves descriptive error for invalid quantities', () => {
    expect(calculateWeddingBreakdown(costs, -1).error).toBeTruthy();
  });
});

describe('Wedding Card checkbox quote and optional Name Label / Other', () => {
  const { calculateWeddingQuote, calculateWeddingBreakdown } = require('../../src/utils/weddingCardPricing');
  const product = {
    originalPrice: 12.60, markupPercent: 10, discountPercent: 0,
    printingCharge: 300, packingCharge: 100, designCharge: 200,
    nameLabelCharge: 2.50, otherCharge: 75, otherServiceName: 'Foil Finish'
  };

  test('reference layout defaults to card, design, print, packing only', () => {
    const q = calculateWeddingQuote(product, 300);
    expect(q.lines.map(x => x.key)).toEqual([
      'card', 'design', 'printing', 'packing', 'nameLabel', 'other'
    ]);
    expect(q.lines.map(x => x.selected)).toEqual([true, true, true, true, false, false]);
    expect(q.lines.map(x => x.qty)).toEqual([300, 1, 3, 3, 300, 1]);
    expect(q).toMatchObject({ baseAmount: 4158, printingTotal: 900,
      packingTotal: 300, designTotal: 200, nameLabelTotal: 0,
      otherTotal: 0, amount: 5558 });
  });

  test('Name Label per label and Other per unit become selected line items', () => {
    const q = calculateWeddingQuote(product, 300, {
      selected: { nameLabel: true, other: true },
      nameLabelQty: 200, otherQty: 2, deliveryDays: 5
    });
    expect(q).toMatchObject({ nameLabelTotal: 500, otherTotal: 150,
      deliveryDays: 5, amount: 6208 });
    expect(q.lines.find(x => x.key === 'other')).toMatchObject({
      label: 'Foil Finish', qty: 2, rate: 75, total: 150
    });
  });

  test('unchecking design and print removes both from grand total', () => {
    const q = calculateWeddingQuote(product, 300, {
      selected: { design: false, printing: false }
    });
    expect(q.designTotal).toBe(0);
    expect(q.printingTotal).toBe(0);
    expect(q.amount).toBe(4458);
  });

  test('checking optional services does not pretend their sale prices are verified costs', () => {
    const b = calculateWeddingBreakdown(product, 300, { selected: { nameLabel: true, other: true } });
    expect(b.basis).toMatch(/unknown Name Label\/Other costs/);
    expect(b.estimatedRecoveryTotal).toBe(5180);
  });

  test('rejects unknown selections and invalid additional service counts', () => {
    expect(calculateWeddingQuote(product, 300, { selected: { malicious: true } }).error).toBeTruthy();
    expect(calculateWeddingQuote(product, 300, { otherQty: -2 }).error).toBeTruthy();
    expect(calculateWeddingQuote(product, 300, { nameLabelQty: 1.5 }).error).toBeTruthy();
    expect(calculateWeddingQuote(product, 300, { deliveryDays: 99999 }).error).toBeTruthy();
  });
});
