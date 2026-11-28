// Shared validation for item-group categories used by Rate Calculator.
// Category names are user-visible and referenced by Items and RateCards.
const normalizeCategoryName = value =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const categoryNameError = name => {
  if (!name || name.length < 2 || name.length > 80) {
    return "Category name must be 2 to 80 characters";
  }
  if (/[<>\r\n\t{}]/.test(name)) return "Category name contains unsupported characters";
  return "";
};

const nameRegex = value => {
  const special = new Set(["\\", ".", "^", "$", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|"]);
  const safe = Array.from(String(value)).map(ch => special.has(ch) ? "\\" + ch : ch).join("");
  return new RegExp("^" + safe + "$", "i");
};
module.exports = { normalizeCategoryName, categoryNameError, nameRegex };
