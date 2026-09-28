const { mapWithConcurrency } = require('../../src/controllers/dashboardSummaryController');

describe('dashboard work scheduling', () => {
  test('keeps the original result order and limits concurrent user lookups', async () => {
    let active = 0;
    let maximum = 0;
    const values = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 10;
    });
    expect(values).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(maximum).toBe(3);
    expect(active).toBe(0);
  });

  test('handles empty user lists without scheduling work', async () => {
    const mapper = jest.fn();
    await expect(mapWithConcurrency([], 4, mapper)).resolves.toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });
});
