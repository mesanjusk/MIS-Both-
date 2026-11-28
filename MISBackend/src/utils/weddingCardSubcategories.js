// Stable codes identify Wedding Card subcategories; labels can be freely
// renamed. Codes stay in the existing Wedding Card document (not Item masters).
const NORMALIZED_CODE = /^[A-Z][A-Z0-9_-]{0,11}$/;
const DEFAULT_SUBCATEGORIES = Object.freeze([
  { code: 'M', label: 'SK (M)' },
  { code: 'K', label: 'SK (K)' },
]);
const normalizeCode = input => String(input ?? '').trim().toUpperCase();
const isSubcategoryCode = value => NORMALIZED_CODE.test(normalizeCode(value));
const normalizeLabel = (value, code) => String(value ?? '').trim().replace(/\s+/g, ' ') || `SK (${code})`;
const validateLabel = value =>
  value.length >= 2 && value.length <= 60 && !/[<>\r\n\t{}]/.test(value);

const initialSubcategories = (variants = []) => {
  const byCode = new Map(DEFAULT_SUBCATEGORIES.map(row => [row.code, { ...row }]));
  for (const item of variants) {
    const code = normalizeCode(item.brand);
    if (isSubcategoryCode(code) && !byCode.has(code)) {
      byCode.set(code, { code, label: `SK (${code})` });
    }
  }
  return Array.from(byCode.values());
};

const subcategoriesFor = parent => {
  if (parent?.weddingCardCatalogInitialized) {
    return (parent.weddingCardSubcategories || []).map(row => ({
      code: row.code, label: row.label || `SK (${row.code})`
    }));
  }
  return initialSubcategories(parent?.weddingCardVariants || []);
};

module.exports = {
  DEFAULT_SUBCATEGORIES, normalizeCode, isSubcategoryCode,
  normalizeLabel, validateLabel, initialSubcategories, subcategoriesFor,
};
