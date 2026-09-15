// The inbox showed nothing recent because the provider's /messages endpoint is
// a forward cursor: ascending by createdAt, limited, paged with `since`. Asked
// with no cursor — which is what the inbox did every five seconds — it returns
// the OLDEST rows the account has. These cover the walk to the newest messages
// and the single-request steady state that follows it.

const mockListMessages = jest.fn();

jest.mock('../../src/services/sanjuskApiService', () => ({
  listMessages: mockListMessages,
}));

const conversation = require('../../src/services/sanjuskConversationService');

// A fake provider: holds every message, answers ascending-after-`since`,
// exactly as the real endpoint does.
const buildProvider = (total) => {
  const all = Array.from({ length: total }, (_, index) => ({
    id: `m${index + 1}`,
    text: `message ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
  }));

  mockListMessages.mockImplementation(async ({ since, limit }) => {
    const start = since ? all.findIndex((row) => row.createdAt > since) : 0;
    const from = start === -1 ? all.length : start;
    const page = all.slice(from, from + limit);
    return {
      data: page,
      nextSince: page.length ? page[page.length - 1].createdAt : null,
      hasMore: from + page.length < all.length,
    };
  });

  return all;
};

beforeEach(() => {
  conversation.resetCache();
  mockListMessages.mockReset();
});

describe('getRecentMessages', () => {
  it('returns the newest messages, not the oldest, on a long history', async () => {
    const all = buildProvider(1000);

    const { rows } = await conversation.getRecentMessages({ limit: 100 });

    expect(rows).toHaveLength(100);
    expect(rows[rows.length - 1].id).toBe('m1000');
    expect(rows[0].id).toBe('m901');
  });

  it('keeps oldest-first ordering within the returned window', async () => {
    buildProvider(500);

    const { rows } = await conversation.getRecentMessages({ limit: 5 });

    expect(rows.map((row) => row.id)).toEqual(['m496', 'm497', 'm498', 'm499', 'm500']);
  });

  it('walks history once, then costs a single request per refresh', async () => {
    buildProvider(1000);

    await conversation.getRecentMessages({ limit: 100 });
    const callsAfterWarm = mockListMessages.mock.calls.length;
    expect(callsAfterWarm).toBeGreaterThan(1); // it had to page to reach the end

    mockListMessages.mockClear();
    await conversation.getRecentMessages({ limit: 100 });
    await conversation.getRecentMessages({ limit: 100 });

    // One per poll, the same cost as the version that returned stale rows.
    expect(mockListMessages).toHaveBeenCalledTimes(2);
  });

  it('picks up a message that arrives after the first read', async () => {
    const all = buildProvider(300);
    await conversation.getRecentMessages({ limit: 10 });

    all.push({
      id: 'm301',
      text: 'brand new',
      createdAt: new Date(Date.UTC(2026, 0, 1) + 300 * 60_000).toISOString(),
    });

    const { rows } = await conversation.getRecentMessages({ limit: 10 });

    expect(rows[rows.length - 1].id).toBe('m301');
  });

  it('does not duplicate rows when a page is served twice', async () => {
    buildProvider(50);
    await conversation.getRecentMessages({ limit: 50 });

    // Replay the whole history as though the cursor had not advanced.
    mockListMessages.mockImplementation(async () => ({
      data: [
        { id: 'm49', text: 'message 49', createdAt: new Date(Date.UTC(2026, 0, 1) + 48 * 60_000).toISOString() },
        { id: 'm50', text: 'message 50', createdAt: new Date(Date.UTC(2026, 0, 1) + 49 * 60_000).toISOString() },
      ],
      nextSince: null,
      hasMore: false,
    }));

    const { rows } = await conversation.getRecentMessages({ limit: 50 });

    expect(rows.filter((row) => row.id === 'm50')).toHaveLength(1);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('shares one refresh between concurrent pollers', async () => {
    buildProvider(600);

    await Promise.all([
      conversation.getRecentMessages({ limit: 100 }),
      conversation.getRecentMessages({ limit: 100 }),
      conversation.getRecentMessages({ limit: 100 }),
    ]);

    // Three tabs polling at once must not each walk the history.
    const pagesForOneWalk = Math.ceil(600 / conversation.PROVIDER_MAX_LIMIT) + 1;
    expect(mockListMessages.mock.calls.length).toBeLessThanOrEqual(pagesForOneWalk);
  });

  it('retries the walk after a failure instead of serving an empty inbox', async () => {
    mockListMessages.mockRejectedValueOnce(new Error('provider down'));

    await expect(conversation.getRecentMessages({ limit: 10 })).rejects.toThrow('provider down');

    buildProvider(20);
    const { rows } = await conversation.getRecentMessages({ limit: 10 });

    expect(rows[rows.length - 1].id).toBe('m20');
  });
});
