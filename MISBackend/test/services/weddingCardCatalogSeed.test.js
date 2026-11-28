jest.mock("../../src/repositories/items", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../src/repositories/rateCard", () => ({
  findOne: jest.fn(),
}));
const Items = require("../../src/repositories/items");
const { seedWeddingCardCatalog } = require("../../src/services/weddingCardCatalogSeed");

describe("one-time seeded Wedding Card catalog", () => {
  beforeEach(() => jest.clearAllMocks());

  test("seeds once and does not reintroduce renamed SK(M) after restart", async () => {
    const document = {
      Item_uuid: "test-wedding",
      Item_name: "Wedding Card",
      weddingCardCatalogInitialized: false,
      weddingCardSubcategories: [],
      weddingCardVariants: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    Items.findOne.mockResolvedValue(document);
    const first = await seedWeddingCardCatalog();
    expect(first.inserted).toBe(272);
    expect(document.weddingCardSubcategories).toEqual([
      { code: "M", label: "SK (M)" }, { code: "K", label: "SK (K)" },
    ]);
    expect(document.weddingCardCatalogInitialized).toBe(true);
    expect(document.save).toHaveBeenCalledTimes(1);

    for (const item of document.weddingCardVariants) {
      if (item.brand === "M") item.brand = "PREM";
    }
    document.weddingCardSubcategories = [
      { code: "PREM", label: "Premium Cards" }, { code: "K", label: "SK (K)" },
    ];

    const second = await seedWeddingCardCatalog();
    expect(second.inserted).toBe(0);
    expect(second.alreadyInitialized).toBe(true);
    expect(document.weddingCardVariants).toHaveLength(272);
    expect(document.weddingCardVariants.every(row => row.brand !== "M")).toBe(true);
    expect(document.save).toHaveBeenCalledTimes(1);
  });
});
