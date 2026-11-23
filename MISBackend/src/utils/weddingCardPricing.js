// Pricing for ONE Wedding Card design (variant of the existing Wedding Card Item).
// Original supplier price is per card, print/pack charge is per 100 cards,
// and design charge applies ONCE per quote line, not per card.
const DIGIT_CODE = Object.freeze({
  '1':'N','2':'A','3':'G','4':'P','5':'U','6':'R','7':'C','8':'I','9':'T','0':'Y',
});
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const encodePrice = (value) => String(value).replace(/[0-9]/g, digit => DIGIT_CODE[digit]);
const validPercent = (percent, fallback = 0) =>
  Number.isFinite(Number(percent)) && percent !== '' && percent != null ? Number(percent) : fallback;
const markUpPrice = (originalPrice, markupPercent = 10) =>
  roundMoney(Number(originalPrice) * (1 + validPercent(markupPercent, 10) / 100));
const markUpTenPercent = (originalPrice) => markUpPrice(originalPrice, 10);

const calculateWeddingQuote = (record, quantity, overrides = {}) => {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0 || qty > 10000000) {
    return { error: 'Quantity must be a positive whole number' };
  }
  const markupPercent = overrides.markupPercent ?? record.markupPercent ?? 10;
  const discountPercent = overrides.discountPercent ?? record.discountPercent ?? 0;
  if (![markupPercent, discountPercent].every(p => Number.isFinite(Number(p))) ||
      Number(markupPercent) < 0 || Number(markupPercent) > 1000 ||
      Number(discountPercent) < 0 || Number(discountPercent) > 100) {
    return { error: 'Invalid markup or discount percentage' };
  }
  const originalPrice = Number(record.originalPrice) || 0;
  const markedUpUnitPrice = markUpPrice(originalPrice, markupPercent);
  const discountedUnitPrice = roundMoney(markedUpUnitPrice * (1 - Number(discountPercent) / 100));
  const baseAmount = roundMoney(discountedUnitPrice * qty);
  // Proportionally bill batches: 150 pieces = 1.5 x the per-100 rate.
  const printingTotal = roundMoney((Number(record.printingCharge) || 0) * qty / 100);
  const packingTotal = roundMoney((Number(record.packingCharge) || 0) * qty / 100);
  const designTotal = roundMoney(Number(record.designCharge) || 0);
  const amount = roundMoney(baseAmount + printingTotal + packingTotal + designTotal);
  return {
    qty, markupPercent: Number(markupPercent), discountPercent: Number(discountPercent),
    markedUpUnitPrice, discountedUnitPrice, baseAmount,
    printingTotal, packingTotal, designTotal, amount,
    effectiveUnitPrice: roundMoney(amount / qty)
  };
};

const withCalculatedPrices = (record) => {
  const result = calculateWeddingQuote(record, 100);
  const updatedPrice = markUpPrice(record.originalPrice, record.markupPercent ?? 10);
  return {
    ...record,
    imageUrl: record.images?.[0]?.url || record.imageUrl || '',
    markupPercent: record.markupPercent ?? 10,
    discountPercent: record.discountPercent ?? 0,
    codedPrice: encodePrice(record.originalPrice),
    updatedPrice,
    discountedUnitPrice: result.discountedUnitPrice,
    // A per-unit figure without one-time design/setup costs.
    finalRate: result.discountedUnitPrice,
    hundredTotal: result.amount,
  };
};
module.exports = {
  roundMoney, encodePrice, markUpPrice, markUpTenPercent,
  calculateWeddingQuote, withCalculatedPrices,
};
