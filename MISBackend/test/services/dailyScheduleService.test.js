// Daily jobs on a host that sleeps.
//
// The old schedulers fired on an exact wall-clock match with the "ran today"
// marker in a module variable, so a process that was asleep at 09:00 skipped
// that day's digests entirely and a restart could send them twice. These cover
// the replacement: due-and-not-yet-run instead of exact-minute, with the
// marker in Mongo.

const mockStore = new Map();

jest.mock('../../src/repositories/appSetting', () => ({
  AppSetting: {
    getSetting: jest.fn(async (key, fallback = null) => (mockStore.has(key) ? mockStore.get(key) : fallback)),
    upsertSetting: jest.fn(async ({ key, value }) => {
      mockStore.set(key, JSON.parse(JSON.stringify(value)));
      return value;
    }),

    /**
     * Enough of updateOne to model the per-job claim: the `value.<job>` $ne
     * guard that makes the claim conditional, $set on that one field, and
     * $setOnInsert for creating the settings document. modifiedCount is what
     * tells the caller whether it won the claim.
     */
    updateOne: jest.fn(async (filter, update, options = {}) => {
      const key = filter.key;
      const exists = mockStore.has(key);

      if (!exists) {
        if (options.upsert && update.$setOnInsert) {
          mockStore.set(key, JSON.parse(JSON.stringify(update.$setOnInsert.value || {})));
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      }

      const current = mockStore.get(key);

      // Honour a `value.<field>: { $ne: x }` condition.
      const fieldCondition = Object.entries(filter).find(([k]) => k.startsWith('value.'));
      if (fieldCondition) {
        const [path, condition] = fieldCondition;
        const field = path.slice('value.'.length);
        if (condition && '$ne' in condition && current[field] === condition.$ne) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
      }

      if (update.$set) {
        for (const [path, val] of Object.entries(update.$set)) {
          if (path.startsWith('value.')) current[path.slice('value.'.length)] = val;
        }
        mockStore.set(key, current);
        return { matchedCount: 1, modifiedCount: 1 };
      }

      return { matchedCount: 1, modifiedCount: 0 };
    }),
  },
}));

const { AppSetting } = require('../../src/repositories/appSetting');
const { runDueJobs, decide, dayKeyOf, istNow, SETTING_KEY } = require('../../src/services/dailyScheduleService');

// A moment in IST, expressed as the UTC instant that produces it (IST = +5:30).
const ist = (hour, minute, day = 15) =>
  new Date(Date.UTC(2026, 8, day, hour - 5, minute - 30));

const jobAt = (hour, minute, run, extra = {}) => ({
  key: 'digest.morning',
  hour,
  minute,
  run,
  ...extra,
});

beforeEach(() => {
  mockStore.clear();
  AppSetting.getSetting.mockClear();
  AppSetting.upsertSetting.mockClear();
  AppSetting.updateOne.mockClear();
});

describe('decide', () => {
  it('does not run before the scheduled time', () => {
    expect(decide({ ist: istNow(ist(8, 59)), hour: 9, minute: 0, lastRunDay: null })).toBe('skip');
  });

  it('runs exactly on time', () => {
    expect(decide({ ist: istNow(ist(9, 0)), hour: 9, minute: 0, lastRunDay: null })).toBe('run');
  });

  it('still runs when the process woke up late', () => {
    expect(decide({ ist: istNow(ist(9, 47)), hour: 9, minute: 0, lastRunDay: null })).toBe('run');
  });

  it('goes stale once the catch-up window closes', () => {
    expect(
      decide({ ist: istNow(ist(23, 0)), hour: 9, minute: 0, lastRunDay: null, catchUpMinutes: 4 * 60 })
    ).toBe('stale');
  });

  it('does not run twice on the same day', () => {
    const now = istNow(ist(9, 30));
    expect(decide({ ist: now, hour: 9, minute: 0, lastRunDay: dayKeyOf(now) })).toBe('skip');
  });

  it('runs again the next day', () => {
    const now = istNow(ist(9, 30, 16));
    expect(decide({ ist: now, hour: 9, minute: 0, lastRunDay: '2026-09-15' })).toBe('run');
  });
});

describe('runDueJobs', () => {
  it('sends the morning digest even though 09:00 passed while the host slept', async () => {
    const run = jest.fn(async () => {});

    const outcomes = await runDueJobs([jobAt(9, 0, run)], { now: ist(9, 40) });

    expect(run).toHaveBeenCalledTimes(1);
    expect(outcomes[0]).toMatchObject({ key: 'digest.morning', ran: true, lateByMinutes: 40 });
  });

  it('does not resend after a restart that lost in-memory state', async () => {
    const run = jest.fn(async () => {});

    await runDueJobs([jobAt(9, 0, run)], { now: ist(9, 0) });
    // A redeploy: fresh process, same database.
    await runDueJobs([jobAt(9, 0, run)], { now: ist(9, 1) });
    await runDueJobs([jobAt(9, 0, run)], { now: ist(11, 30) });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('marks a job run before doing the work, so a mid-send failure is not retried all day', async () => {
    const run = jest.fn(async () => {
      throw new Error('provider down halfway through the recipients');
    });

    const first = await runDueJobs([jobAt(9, 0, run)], { now: ist(9, 5) });
    const second = await runDueJobs([jobAt(9, 0, run)], { now: ist(9, 6) });

    expect(first[0]).toMatchObject({ ran: false, reason: 'error' });
    expect(second).toHaveLength(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips a job whose window closed, and does not carry it into tomorrow', async () => {
    const run = jest.fn(async () => {});

    const today = await runDueJobs([jobAt(9, 0, run, { catchUpMinutes: 120 })], { now: ist(22, 0) });
    expect(today[0]).toMatchObject({ ran: false, reason: 'stale' });
    expect(run).not.toHaveBeenCalled();

    const tomorrow = await runDueJobs([jobAt(9, 0, run, { catchUpMinutes: 120 })], { now: ist(9, 10, 16) });
    expect(tomorrow[0]).toMatchObject({ ran: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs each due job independently', async () => {
    const morning = jest.fn(async () => {});
    const evening = jest.fn(async () => {});

    await runDueJobs(
      [
        { key: 'digest.morning', hour: 9, minute: 0, run: morning },
        { key: 'digest.evening', hour: 19, minute: 0, run: evening },
      ],
      { now: ist(9, 30) }
    );

    expect(morning).toHaveBeenCalledTimes(1);
    expect(evening).not.toHaveBeenCalled();
  });

  it('skips the tick rather than guessing when the marker cannot be read', async () => {
    const run = jest.fn(async () => {});
    AppSetting.getSetting.mockRejectedValueOnce(new Error('mongo down'));

    const outcomes = await runDueJobs([jobAt(9, 0, run)], { now: ist(9, 5) });

    expect(outcomes).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('persists the marker under a stable key', async () => {
    await runDueJobs([jobAt(9, 0, jest.fn(async () => {}))], { now: ist(9, 5) });

    expect(mockStore.get(SETTING_KEY)).toEqual({ 'digest.morning': '2026-09-15' });
  });
});
