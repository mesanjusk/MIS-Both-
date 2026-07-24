// Shared pricing logic for Rate Cards, used by the Rate Calculator and the
// Rate Card Master preview. Keep in sync with any server-side validation.

export function findMatchingSlab(slabs = [], qty = 0) {
  return (
    (slabs || []).find((s) => {
      const min = Number(s.minQty) || 0;
      const max = Number(s.maxQty) || 0;
      return qty >= min && (max <= 0 || qty <= max);
    }) || null
  );
}

// Returns { sqft, unitAmount, amount, matchedSlab, error }
export function computeRateCardAmount(rateCard, { widthFt = 0, heightFt = 0, qty = 1 } = {}) {
  const quantity = Math.max(0, Number(qty) || 0);

  if (!rateCard) return { amount: 0, error: 'No item selected' };

  if (rateCard.pricingType === 'per_sqft') {
    const w = Number(widthFt) || 0;
    const h = Number(heightFt) || 0;
    let sqft = w * h;
    const minSqft = Number(rateCard.minBillingSqft) || 0;
    if (minSqft > 0 && sqft < minSqft) sqft = minSqft;
    const unitAmount = sqft * (Number(rateCard.ratePerSqft) || 0);
    return { sqft, unitAmount, amount: unitAmount * quantity };
  }

  if (rateCard.pricingType === 'slab') {
    const matchedSlab = findMatchingSlab(rateCard.slabs, quantity);
    if (!matchedSlab) {
      return { amount: 0, matchedSlab: null, error: 'No slab matches this quantity' };
    }
    const amount = matchedSlab.flatPrice > 0 ? matchedSlab.flatPrice : matchedSlab.ratePerPiece * quantity;
    return { amount, matchedSlab };
  }

  // per_piece
  const unitAmount = Number(rateCard.ratePerPiece) || 0;
  return { unitAmount, amount: unitAmount * quantity };
}

export function computeGst(amount, gstPercent = 0) {
  const gst = (Number(amount) || 0) * (Number(gstPercent) || 0) / 100;
  return { gst, total: (Number(amount) || 0) + gst };
}
