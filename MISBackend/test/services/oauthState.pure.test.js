/**
 * OAuth callbacks accepted whatever state they were handed: Drive's was just a
 * return URL and its connect endpoint was public, so anyone able to complete
 * Google consent for this OAuth client could replace the configured
 * connection. Gmail and social carried the actor's identity in an unsigned
 * base64 blob.
 *
 * State is now issued server-side, scoped to one flow, and redeemable once.
 */
jest.mock('../../src/repositories/oauthState');

const OAuthState = require('../../src/repositories/oauthState');
const { createState, consumeState } = require('../../src/services/oauthStateService');

const user = { id: 'u-1', userName: 'Admin' };

beforeEach(() => {
  jest.clearAllMocks();
  OAuthState.create.mockResolvedValue({});
});

/** The row consumeState will find, or null for an unknown/used state. */
const mockStored = (row) => {
  OAuthState.findOneAndDelete.mockReturnValue({ lean: () => Promise.resolve(row) });
};

const storedRow = (over = {}) => ({
  nonce: 'n', purpose: 'google_drive', user_id: 'u-1', user_name: 'Admin',
  return_to: 'https://app.example.com/home',
  expires_at: new Date(Date.now() + 60_000),
  ...over,
});

describe('createState', () => {
  test('stores the initiator, the flow and a validated redirect', async () => {
    await createState({ purpose: 'google_drive', user, returnTo: 'https://app.example.com/home' });

    expect(OAuthState.create).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'google_drive',
        user_id: 'u-1',
        user_name: 'Admin',
        return_to: 'https://app.example.com/home',
      })
    );
  });

  test('issues an unpredictable nonce, different every time', async () => {
    const a = await createState({ purpose: 'gmail', user });
    const b = await createState({ purpose: 'gmail', user });
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  test('sets an expiry in the future', async () => {
    await createState({ purpose: 'gmail', user });
    const { expires_at } = OAuthState.create.mock.calls[0][0];
    expect(expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('refuses to issue a state with no flow', async () => {
    await expect(createState({ user })).rejects.toThrow(/purpose/);
  });
});

describe('consumeState', () => {
  test('redeems by deleting, so the same state cannot be replayed', async () => {
    mockStored(storedRow());
    const state = await consumeState('n', 'google_drive');

    expect(state.user_id).toBe('u-1');
    // Redemption is the delete itself — atomic, so two concurrent callbacks
    // cannot both succeed.
    expect(OAuthState.findOneAndDelete).toHaveBeenCalledWith({ nonce: 'n', purpose: 'google_drive' });
  });

  test('a second redemption finds nothing', async () => {
    mockStored(null);
    expect(await consumeState('n', 'google_drive')).toBeNull();
  });

  test('is scoped to one flow: a Drive state is not redeemable at the Gmail callback', async () => {
    mockStored(null);
    await consumeState('n', 'gmail');
    expect(OAuthState.findOneAndDelete).toHaveBeenCalledWith({ nonce: 'n', purpose: 'gmail' });
  });

  test('rejects an expired state even if the row is still there', async () => {
    // The TTL index is only a sweeper and may not exist on a deployed database,
    // so expiry is enforced here rather than assumed.
    mockStored(storedRow({ expires_at: new Date(Date.now() - 1000) }));
    expect(await consumeState('n', 'google_drive')).toBeNull();
  });

  test('rejects a missing or empty state without querying', async () => {
    expect(await consumeState('', 'google_drive')).toBeNull();
    expect(await consumeState(undefined, 'google_drive')).toBeNull();
    expect(OAuthState.findOneAndDelete).not.toHaveBeenCalled();
  });
});
