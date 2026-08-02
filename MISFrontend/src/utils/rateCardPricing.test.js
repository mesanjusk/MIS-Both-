import { describe, test, expect } from 'vitest';
import { findMatchingSlab, computeRateCardAmount, computeGst } from './rateCardPricing';

describe('findMatchingSlab', () => {
  const slabs = [
    { minQty: 1, maxQty: 10, ratePerPiece: 10 },
    { minQty: 11, maxQty: 50, ratePerPiece: 8 },
    { minQty: 51, maxQty: 0, ratePerPiece: 5 }, // maxQty <= 0 means open-ended
  ];

  test('matches the slab whose range contains qty', () => {
    expect(findMatchingSlab(slabs, 5)).toBe(slabs[0]);
    expect(findMatchingSlab(slabs, 25)).toBe(slabs[1]);
  });

  test('treats maxQty <= 0 as an open-ended upper bound', () => {
    expect(findMatchingSlab(slabs, 1000)).toBe(slabs[2]);
  });

  test('returns null when no slab matches', () => {
    expect(findMatchingSlab([], 5)).toBeNull();
    expect(findMatchingSlab([{ minQty: 100, maxQty: 200, ratePerPiece: 1 }], 5)).toBeNull();
  });
});

describe('computeRateCardAmount', () => {
  test('returns an error when no rate card is selected', () => {
    expect(computeRateCardAmount(null)).toEqual({ amount: 0, error: 'No item selected' });
  });

  test('per_sqft pricing multiplies area by rate and by quantity', () => {
    const rateCard = { pricingType: 'per_sqft', ratePerSqft: 20, minBillingSqft: 0 };
    const result = computeRateCardAmount(rateCard, { widthFt: 2, heightFt: 3, qty: 4 });
    expect(result.sqft).toBe(6);
    expect(result.unitAmount).toBe(120);
    expect(result.amount).toBe(480);
  });

  test('per_sqft pricing enforces the minimum billable area', () => {
    const rateCard = { pricingType: 'per_sqft', ratePerSqft: 20, minBillingSqft: 10 };
    const result = computeRateCardAmount(rateCard, { widthFt: 1, heightFt: 1, qty: 1 });
    expect(result.sqft).toBe(10);
    expect(result.amount).toBe(200);
  });

  test('slab pricing uses flatPrice when set on the matched slab', () => {
    const rateCard = {
      pricingType: 'slab',
      slabs: [{ minQty: 1, maxQty: 100, flatPrice: 999, ratePerPiece: 5 }],
    };
    const result = computeRateCardAmount(rateCard, { qty: 10 });
    expect(result.amount).toBe(999);
  });

  test('slab pricing falls back to ratePerPiece * qty when flatPrice is not set', () => {
    const rateCard = {
      pricingType: 'slab',
      slabs: [{ minQty: 1, maxQty: 100, flatPrice: 0, ratePerPiece: 5 }],
    };
    const result = computeRateCardAmount(rateCard, { qty: 10 });
    expect(result.amount).toBe(50);
  });

  test('slab pricing errors out when quantity matches no slab', () => {
    const rateCard = { pricingType: 'slab', slabs: [{ minQty: 100, maxQty: 200, ratePerPiece: 5 }] };
    const result = computeRateCardAmount(rateCard, { qty: 1 });
    expect(result).toEqual({ amount: 0, matchedSlab: null, error: 'No slab matches this quantity' });
  });

  test('per_piece pricing multiplies ratePerPiece by qty', () => {
    const rateCard = { pricingType: 'per_piece', ratePerPiece: 15 };
    const result = computeRateCardAmount(rateCard, { qty: 3 });
    expect(result.unitAmount).toBe(15);
    expect(result.amount).toBe(45);
  });

  test('clamps a negative or non-numeric qty to 0', () => {
    const rateCard = { pricingType: 'per_piece', ratePerPiece: 15 };
    expect(computeRateCardAmount(rateCard, { qty: -5 }).amount).toBe(0);
    expect(computeRateCardAmount(rateCard, { qty: 'nonsense' }).amount).toBe(0);
  });
});

describe('computeGst', () => {
  test('computes gst amount and total from a percentage', () => {
    expect(computeGst(1000, 18)).toEqual({ gst: 180, total: 1180 });
  });

  test('defaults to 0% gst when not provided', () => {
    expect(computeGst(1000)).toEqual({ gst: 0, total: 1000 });
  });

  test('treats non-numeric input as 0', () => {
    expect(computeGst('abc', 'xyz')).toEqual({ gst: 0, total: 0 });
  });
});
