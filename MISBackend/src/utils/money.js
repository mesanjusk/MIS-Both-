// Strips currency symbol/commas/whitespace and parses to a finite number,
// defaulting to 0 for empty/invalid input. Returns the raw parsed value
// unrounded — callers that need currency-precision rounding (e.g. the
// accounting posting engine) round the result themselves, since ledger/bank
// -statement parsing intentionally keeps full precision while money postings
// round to 2dp for balanced-journal totals.
function parseAmount(value) {
  const parsed = Number(String(value ?? '').replace(/[₹,\s]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = { parseAmount };
