// Wedding Card variants belong to the existing Wedding Card Item. Supplier cost
// is per card, print/pack sell rates are per 100, and design is charged once.
const DIGIT_CODE = Object.freeze({
  '1':'N','2':'A','3':'G','4':'P','5':'U','6':'R','7':'C','8':'I','9':'T','0':'Y',
});
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const encodePrice = value => String(value).replace(/[0-9]/g, digit => DIGIT_CODE[digit]);
const validPercent = (percent, fallback = 0) =>
  Number.isFinite(Number(percent)) && percent !== '' && percent != null ? Number(percent) : fallback;
const markUpPrice = (originalPrice, markupPercent = 10) =>
  roundMoney(Number(originalPrice) * (1 + validPercent(markupPercent, 10) / 100));
const markUpTenPercent = originalPrice => markUpPrice(originalPrice, 10);

const DEFAULT_SELECTED = Object.freeze({
  card: true, design: true, printing: true, packing: true, nameLabel: false, other: false
});
const ROW_KEYS = Object.keys(DEFAULT_SELECTED);
const safeQty = (input, fallback) => {
  const n = Number(input ?? fallback);
  return Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : NaN;
};

// All totals are computed on the server. The browser may choose checkboxes and
// quantities but cannot override supplier cost or charge/rate definitions.
const calculateWeddingQuote = (record, quantity, overrides = {}) => {
  const qty = Number(quantity);
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 1000000) {
    return { error: 'Quantity must be a positive whole number' };
  }
  const markupPercent = overrides.markupPercent ?? record.markupPercent ?? 10;
  const discountPercent = overrides.discountPercent ?? record.discountPercent ?? 0;
  if (![markupPercent, discountPercent].every(p => Number.isFinite(Number(p))) ||
      Number(markupPercent) < 0 || Number(markupPercent) > 1000 ||
      Number(discountPercent) < 0 || Number(discountPercent) > 100) {
    return { error: 'Invalid markup or discount percentage' };
  }
  const nameLabelQty = safeQty(overrides.nameLabelQty, qty);
  const otherQty = safeQty(overrides.otherQty, 1);
  const deliveryDays = overrides.deliveryDays == null || overrides.deliveryDays === ''
    ? null : safeQty(overrides.deliveryDays, 0);
  if (![nameLabelQty, otherQty].every(Number.isFinite) ||
      (deliveryDays != null && (!Number.isFinite(deliveryDays) || deliveryDays > 3650))) {
    return { error: 'Invalid service quantity or delivery days' };
  }
  const selected = { ...DEFAULT_SELECTED };
  if (overrides.selected != null) {
    if (!overrides.selected || typeof overrides.selected !== 'object' ||
        Array.isArray(overrides.selected) ||
        Object.entries(overrides.selected).some(([key,value]) =>
          !ROW_KEYS.includes(key) || typeof value !== 'boolean')) {
      return { error: 'Invalid selected services' };
    }
    Object.assign(selected, overrides.selected);
  }

  const originalPrice = Number(record.originalPrice) || 0;
  const markedUpUnitPrice = markUpPrice(originalPrice, markupPercent);
  const discountedUnitPrice = roundMoney(markedUpUnitPrice * (1 - Number(discountPercent) / 100));
  const printQty = qty / 100;
  const lineInputs = [
    ['card', 'Card rate', qty, discountedUnitPrice, 'per card'],
    ['design', 'Designing', 1, Number(record.designCharge) || 0, 'one time'],
    ['printing', 'Printing', printQty, Number(record.printingCharge) || 0, 'per 100'],
    ['packing', 'Packing', printQty, Number(record.packingCharge) || 0, 'per 100'],
    ['nameLabel', 'Name Label', nameLabelQty, Number(record.nameLabelCharge) || 0, 'per label'],
    ['other', String(record.otherServiceName || 'Other').slice(0, 45), otherQty,
      Number(record.otherCharge) || 0, 'per unit'],
  ];
  const lines = lineInputs.map(([key, label, rowQty, rate, unit]) => ({
    key, label, selected: selected[key], qty: rowQty, rate, unit,
    total: selected[key] ? roundMoney(rowQty * rate) : 0,
  }));
  const line = key => lines.find(item => item.key === key).total;
  const baseAmount = line('card');
  const printingTotal = line('printing');
  const packingTotal = line('packing');
  const designTotal = line('design');
  const nameLabelTotal = line('nameLabel');
  const otherTotal = line('other');
  const amount = roundMoney(lines.reduce((sum, item) => sum + item.total, 0));
  return {
    qty, selected, nameLabelQty, otherQty, deliveryDays, lines,
    markupPercent: Number(markupPercent), discountPercent: Number(discountPercent),
    markedUpUnitPrice, discountedUnitPrice, baseAmount,
    printingTotal, packingTotal, designTotal, nameLabelTotal, otherTotal, amount,
    effectiveUnitPrice: roundMoney(amount / qty),
  };
};

// Break-even is an estimate from the known supplier and production amounts.
// Name-label and Other are sell prices only; their unknown costs are excluded.
const calculateWeddingBreakdown = (record, quantity, overrides = {}) => {
  const quote = calculateWeddingQuote(record, quantity, overrides);
  if (quote.error) return quote;
  const supplierUnitPrice = Number(record.originalPrice) || 0;
  const supplierTotal = quote.selected.card ? roundMoney(supplierUnitPrice * quote.qty) : 0;
  const estimatedRecoveryTotal = roundMoney(
    supplierTotal + quote.printingTotal + quote.packingTotal + quote.designTotal
  );
  const estimatedBreakEvenUnit = roundMoney(estimatedRecoveryTotal / quote.qty);
  const estimatedContribution = roundMoney(quote.amount - estimatedRecoveryTotal);
  return {
    supplierUnitPrice, supplierTotal,
    printingRatePer100: Number(record.printingCharge) || 0,
    packingRatePer100: Number(record.packingCharge) || 0,
    designChargeOnce: Number(record.designCharge) || 0,
    markupPercent: quote.markupPercent, discountPercent: quote.discountPercent,
    markedUpUnitPrice: quote.markedUpUnitPrice,
    discountedUnitPrice: quote.discountedUnitPrice,
    cardSellingTotal: quote.baseAmount,
    printingTotal: quote.printingTotal, packingTotal: quote.packingTotal,
    designTotal: quote.designTotal, nameLabelTotal: quote.nameLabelTotal,
    otherTotal: quote.otherTotal, amount: quote.amount,
    effectiveSellingUnit: quote.effectiveUnitPrice, estimatedRecoveryTotal,
    estimatedBreakEvenUnit, estimatedContribution,
    basis: 'Estimate only: unknown Name Label/Other costs, overhead and taxes excluded',
  };
};

const withCalculatedPrices = record => {
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
    finalRate: result.discountedUnitPrice,
    hundredTotal: result.amount,
  };
};
module.exports = {
  roundMoney, encodePrice, markUpPrice, markUpTenPercent,
  DEFAULT_SELECTED, calculateWeddingQuote, calculateWeddingBreakdown, withCalculatedPrices,
};
