const {
  parseSize,
  sizeToFeet,
  parseRequirementRuleBased,
  missingFields,
  scoreRateCard,
} = require('../../src/services/customerAiService');
const { computeRateCardAmount, computeGst } = require('../../src/utils/rateCardPricing');

describe('Customer AI pure parsing', () => {
  test('extracts a common visiting card enquiry', () => {
    const result = parseRequirementRuleBased('500 visiting cards 350gsm matte double side kal chahiye');
    expect(result.product).toBe('visiting card');
    expect(result.quantity).toBe(500);
    expect(result.gsm).toBe(350);
    expect(result.lamination).toBe('matte');
    expect(result.sides).toBe('double');
    expect(result.deadline).toBe('tomorrow');
    expect(missingFields(result)).toEqual([]);
  });

  test('parses feet and inch dimensions', () => {
    expect(parseSize('banner 6 ft x 3 ft')).toEqual({ width: 6, height: 3, unit: 'ft' });
    expect(parseSize('sticker 12 inch x 18 inch')).toEqual({ width: 12, height: 18, unit: 'in' });
    expect(sizeToFeet({ width: 12, height: 18, unit: 'in' })).toEqual({ widthFt: 1, heightFt: 1.5 });
  });

  test('reports missing product and quantity instead of inventing them', () => {
    const result = parseRequirementRuleBased('matt lamination chahiye');
    expect(missingFields(result)).toEqual(['product', 'quantity']);
  });

  test('scores exact matching rate card higher', () => {
    const requirement = { product: 'visiting card', gsm: 350, lamination: 'matte' };
    const exact = scoreRateCard(requirement, { itemName: 'Visiting Card 350 GSM Matte', category: 'Cards' });
    const weak = scoreRateCard(requirement, { itemName: 'Banner Flex', category: 'Banner' });
    expect(exact).toBeGreaterThan(weak);
  });
});

describe('server rate card pricing', () => {
  test('per piece pricing matches calculator rules', () => {
    const result = computeRateCardAmount({ pricingType: 'per_piece', ratePerPiece: 2 }, { qty: 500 });
    expect(result.amount).toBe(1000);
    expect(computeGst(result.amount, 18)).toEqual({ gst: 180, total: 1180 });
  });

  test('square foot pricing requires size and respects minimum billing', () => {
    expect(computeRateCardAmount({ pricingType: 'per_sqft', ratePerSqft: 20 }, { qty: 1 }).error).toMatch(/Width and height/);
    const result = computeRateCardAmount({ pricingType: 'per_sqft', ratePerSqft: 20, minBillingSqft: 10 }, { widthFt: 2, heightFt: 3, qty: 1 });
    expect(result.sqft).toBe(10);
    expect(result.amount).toBe(200);
  });

  test('slab pricing uses matching slab', () => {
    const result = computeRateCardAmount({
      pricingType: 'slab',
      slabs: [{ minQty: 100, maxQty: 500, ratePerPiece: 1.5, flatPrice: 0 }],
    }, { qty: 200 });
    expect(result.amount).toBe(300);
  });
});
