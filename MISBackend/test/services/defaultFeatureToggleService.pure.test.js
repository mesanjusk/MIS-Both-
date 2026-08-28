jest.mock('../../src/repositories/featureToggle', () => ({
  bulkWrite: jest.fn(),
}));

const FeatureToggle = require('../../src/repositories/featureToggle');
const {
  DEFAULT_DISABLED_APIS,
  DEFAULT_DISABLED_PAGES,
} = require('../../src/constants/defaultFeatureToggles');
const { ensureDefaultFeatureToggles } = require('../../src/services/defaultFeatureToggleService');

describe('default feature toggles', () => {
  beforeEach(() => {
    FeatureToggle.bulkWrite.mockReset();
    FeatureToggle.bulkWrite.mockResolvedValue({ upsertedCount: 0 });
  });

  it('uses insert-only updates so a manual re-enable survives later deploys', async () => {
    await ensureDefaultFeatureToggles();

    const [operations] = FeatureToggle.bulkWrite.mock.calls[0];
    expect(operations).toHaveLength(DEFAULT_DISABLED_APIS.length + DEFAULT_DISABLED_PAGES.length);
    expect(operations.every((operation) => operation.updateOne.update.$setOnInsert)).toBe(true);
    expect(operations.every((operation) => !operation.updateOne.update.$set)).toBe(true);
  });

  it('does not default-disable core attendance, order, operations or transaction work', () => {
    const keys = new Set([
      ...DEFAULT_DISABLED_APIS.map((entry) => entry.key),
      ...DEFAULT_DISABLED_PAGES.map((entry) => entry.key),
    ]);

    expect(keys.has('/home')).toBe(false);
    expect(keys.has('/attendance')).toBe(false);
    expect(keys.has('/operations')).toBe(false);
    expect(keys.has('/reports/orders')).toBe(false);
    expect(keys.has('/reports/transactions')).toBe(false);
    expect(keys.has('GET /api/attendance')).toBe(false);
    expect(keys.has('GET /api/orders')).toBe(false);
    expect(keys.has('GET /api/operations/me')).toBe(false);
  });
});
