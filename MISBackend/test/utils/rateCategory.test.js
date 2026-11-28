const {
  normalizeCategoryName, categoryNameError, nameRegex
} = require("../../src/utils/rateCategory");

describe("Rate Calculator category name safety", () => {
  test("trims and collapses whitespace without changing letters or display case", () => {
    expect(normalizeCategoryName("  Wedding   Card  ")).toBe("Wedding Card");
    expect(normalizeCategoryName("  लेज़र  कार्ड  ")).toBe("लेज़र कार्ड");
    expect(normalizeCategoryName(undefined)).toBe("");
  });
  test("rejects empty, overlong and unsafe control characters", () => {
    expect(categoryNameError("")).toMatch(/2 to 80/);
    expect(categoryNameError("x")).toMatch(/2 to 80/);
    expect(categoryNameError("A".repeat(81))).toMatch(/2 to 80/);
    expect(categoryNameError("A\nB")).toMatch(/unsupported/);
    expect(categoryNameError("<script>")).toMatch(/unsupported/);
    expect(categoryNameError("Flex & Banner")).toBe("");
  });
  test("case-insensitive duplicate matcher uses a literal name, not regex input", () => {
    expect(nameRegex("SK (M)").test("sk (m)")).toBe(true);
    expect(nameRegex("SK (M)").test("SK AM")).toBe(false);
    expect(nameRegex("3D + Flex").test("3d + flex")).toBe(true);
    expect(nameRegex("3D + Flex").test("3D A Flex")).toBe(false);
    expect(nameRegex("SK [K]").test("SK [k]")).toBe(true);
    expect(nameRegex("SK [K]").test("SK K")).toBe(false);
  });
});
