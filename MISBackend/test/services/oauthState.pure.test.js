/**
 * OAuth state must be server-issued, scoped to one flow and redeemable once.
 * New states live on the existing Users document so issuing OAuth does not need
 * to create a dedicated collection.
 */
jest.mock('../../src/repositories/users');
jest.mock('../../src/repositories/oauthState');

const Users = require('../../src/repositories/users');
const OAuthState = require('../../src/repositories/oauthState');
const { createState, consumeState } = require('../../src/services/oauthStateService');

const user = { id: 'u-1', userName: 'Admin' };

beforeEach(() => {
  jest.clearAllMocks();
  Users.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
});

const mockUserState = (row) => {
  Users.findOneAndUpdate.mockReturnValue({
    lean: () => Promise.resolve(row ? { OAuth_states: [row] } : null),
  });
};

const storedRow = (over = {}) => ({
  nonce: 'n',
  purpose: 'google_drive',
  user_name: 'Admin',
  return_to: 'https://app.example.com/home',
  expires_at: new Date(Date.now() + 60_000),
  ...over,
});

describe('createState', () => {
  test('stores the state on the authenticated user document', async () => {
    const state = await createState({ purpose: 'google_drive', user, returnTo: 'https://app.example.com/home' });

    expect(state).toMatch(/^u1\./);
    expect(Users.updateOne).toHaveBeenCalledWith(
      { _id: 'u-1' },
      expect.objectContaining({ $push: expect.any(Object) })
    );

    const update = Users.updateOne.mock.calls[0][1];
    expect(update.$push.OAuth_states.$each[0]).toEqual(
      expect.objectContaining({
        purpose: 'google_drive',
        user_name: 'Admin',
        return_to: 'https://app.example.com/home',
      })
    );
  });

  test('issues a different unpredictable state every time', async () => {
    const a = await createState({ purpose: 'gmail', user });
    const b = await createState({ purpose: 'gmail', user });
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  test('refuses to issue a state with no purpose or authenticated user', async () => {
    await expect(createState({ user })).rejects.toThrow(/purpose/);
    await expect(createState({ purpose: 'gmail', user: null })).rejects.toThrow(/authenticated user/);
  });
});

describe('consumeState', () => {
  test('atomically removes and returns a user-backed state', async () => {
    // u1.<base64url("u-1")>.n
    const token = 'u1.dS0x.n';
    mockUserState(storedRow());

    const state = await consumeState(token, 'google_drive');

    expect(state.user_id).toBe('u-1');
    expect(state.return_to).toBe('https://app.example.com/home');
    expect(Users.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'u-1',
        OAuth_states: { $elemMatch: { nonce: 'n', purpose: 'google_drive' } },
      },
      { $pull: { OAuth_states: { nonce: 'n', purpose: 'google_drive' } } },
      { new: false, projection: { OAuth_states: 1 } }
    );
  });

  test('a second redemption finds nothing', async () => {
    mockUserState(null);
    expect(await consumeState('u1.dS0x.n', 'google_drive')).toBeNull();
  });

  test('rejects an expired user-backed state', async () => {
    mockUserState(storedRow({ expires_at: new Date(Date.now() - 1000) }));
    expect(await consumeState('u1.dS0x.n', 'google_drive')).toBeNull();
  });

  test('legacy states remain redeemable during migration', async () => {
    OAuthState.findOneAndDelete.mockReturnValue({
      lean: () => Promise.resolve({
        nonce: 'legacy',
        purpose: 'google_drive',
        user_id: 'u-1',
        expires_at: new Date(Date.now() + 60_000),
      }),
    });

    const state = await consumeState('legacy', 'google_drive');
    expect(state.user_id).toBe('u-1');
  });

  test('rejects a missing state without querying storage', async () => {
    expect(await consumeState('', 'google_drive')).toBeNull();
    expect(Users.findOneAndUpdate).not.toHaveBeenCalled();
    expect(OAuthState.findOneAndDelete).not.toHaveBeenCalled();
  });
});
