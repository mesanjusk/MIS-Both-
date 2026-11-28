const {
  initialSubcategories, subcategoriesFor, normalizeCode,
  isSubcategoryCode, normalizeLabel, validateLabel
} = require("../../src/utils/weddingCardSubcategories");

describe("Wedding Card configurable subcategories", () => {
  test("preserves SK(M)/SK(K) as initial categories", () => {
    expect(initialSubcategories([])).toEqual([
      { code: "M", label: "SK (M)" },
      { code: "K", label: "SK (K)" },
    ]);
  });
  test("accepts a custom code with an independent user-visible label", () => {
    expect(normalizeCode(" premium_01 ")).toBe("PREMIUM_01");
    expect(isSubcategoryCode("premium_01")).toBe(true);
    expect(normalizeLabel("  Premium  Cards  ", "PREMIUM_01")).toBe("Premium Cards");
    expect(validateLabel("Premium Cards")).toBe(true);
    expect(isSubcategoryCode("2BAD")).toBe(false);
    expect(isSubcategoryCode("TOO-LONG-CATEGORY")).toBe(false);
    expect(validateLabel("<script>")).toBe(false);
  });
  test("infers unknown brands from existing records for backward compatibility", () => {
    const items = [{ brand: "M" }, { brand: "K" }, { brand: "P" }];
    expect(initialSubcategories(items)).toContainEqual({ code: "P", label: "SK (P)" });
  });
  test("does not auto-restore M/K after a deliberate rename or deletion", () => {
    const parent = {
      weddingCardCatalogInitialized: true,
      weddingCardSubcategories: [
        { code: "PREM", label: "Premium Cards" },
      ],
      weddingCardVariants: [{ brand: "PREM", code: "301" }],
    };
    expect(subcategoriesFor(parent)).toEqual([{ code: "PREM", label: "Premium Cards" }]);
    expect(subcategoriesFor(parent).some(row => row.code === "M" || row.code === "K")).toBe(false);
  });
  test("both Item and legacy RateCard models accept custom brand codes", () => {
    const Items = require("../../src/repositories/items");
    const RateCard = require("../../src/repositories/rateCard");
    for (const model of [Items, RateCard]) {
      const schema = model.schema.path("weddingCardVariants").schema;
      const categoryPath = model.schema.path("weddingCardSubcategories");
      expect(categoryPath).toBeDefined();
      expect(schema.path("brand").options.match.test("PREM")).toBe(true);
      expect(schema.path("brand").options.match.test("M")).toBe(true);
      expect(schema.path("brand").options.match.test("2BAD")).toBe(false);
    }
  });
});
