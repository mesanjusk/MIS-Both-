const jwt = require('jsonwebtoken');

process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret';

// requireAuth checks the account behind the token, so the Users model is
// mocked; see sessionValidation.test.js for the revocation cases.
jest.mock('../../src/repositories/users');
const Users = require('../../src/repositories/users');

const { requireAuth, optionalAuth, requireInternalKey } = require('../../src/middleware/auth');

const mockReq = (overrides = {}) => ({ headers: {}, originalUrl: '/test', ...overrides });
const signToken = (payload, options) => jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, options);

/** The account row requireAuth will read for the token's subject. */
const mockUserRow = (row) => {
  Users.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(row) }) });
};

const activeUser = (id, User_group = 'admin') =>
  ({ _id: id, User_name: 'Test User', User_group, Session_version: 0 });

beforeEach(() => {
  jest.clearAllMocks();
  mockUserRow(activeUser('user-1'));
});

describe('auth.requireAuth', () => {
  test('rejects a request with no Authorization header', async () => {
    const next = jest.fn();
    await requireAuth(mockReq(), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('rejects an Authorization header that is not a Bearer token', async () => {
    const next = jest.fn();
    await requireAuth(mockReq({ headers: { authorization: 'Basic abc123' } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('rejects an invalid/garbage token', async () => {
    const next = jest.fn();
    await requireAuth(mockReq({ headers: { authorization: 'Bearer not-a-real-jwt' } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: expect.stringMatching(/invalid or expired/i) }));
  });

  test('rejects an expired token with a distinct message', async () => {
    const token = signToken({ id: 'user-1' }, { expiresIn: -10 });
    const next = jest.fn();
    await requireAuth(mockReq({ headers: { authorization: `Bearer ${token}` } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: expect.stringMatching(/expired/i) }));
  });

  test('rejects a validly-signed token whose payload has no usable id', async () => {
    const token = signToken({ userGroup: 'admin' }); // no id/_id/userId
    const next = jest.fn();
    await requireAuth(mockReq({ headers: { authorization: `Bearer ${token}` } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: expect.stringMatching(/invalid token payload/i) }));
  });

  test('accepts a valid token and attaches req.user with the resolved id', async () => {
    mockUserRow(activeUser('user-42', 'admin'));
    const token = signToken({ id: 'user-42', userGroup: 'admin' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();
    await requireAuth(req, {}, next);
    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(req.user).toMatchObject({ id: 'user-42', userGroup: 'admin' });
  });

  test('falls back to _id or userId when id is absent from the payload', async () => {
    mockUserRow(activeUser('mongo-id-1'));
    const token = signToken({ _id: 'mongo-id-1' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();
    await requireAuth(req, {}, next);
    expect(req.user.id).toBe('mongo-id-1');
  });
});

describe('auth.optionalAuth', () => {
  test('proceeds without req.user when no Authorization header is present', async () => {
    const req = mockReq();
    const next = jest.fn();
    await optionalAuth(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  test('proceeds without req.user when the token is invalid, instead of blocking the request', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer garbage' } });
    const next = jest.fn();
    await optionalAuth(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  test('attaches req.user when a valid token is present', async () => {
    mockUserRow(activeUser('user-7'));
    const token = signToken({ id: 'user-7' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();
    await optionalAuth(req, {}, next);
    expect(req.user).toMatchObject({ id: 'user-7' });
  });
});

describe('auth.requireInternalKey', () => {
  const OLD_KEY = process.env.INTERNAL_API_KEY;
  afterEach(() => {
    process.env.INTERNAL_API_KEY = OLD_KEY;
  });

  test('blocks the request when INTERNAL_API_KEY is not configured server-side', async () => {
    delete process.env.INTERNAL_API_KEY;
    const next = jest.fn();
    requireInternalKey(mockReq({ headers: {} }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  test('rejects a missing or mismatched key', async () => {
    process.env.INTERNAL_API_KEY = 'expected-key';
    const next = jest.fn();
    requireInternalKey(mockReq({ headers: {} }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));

    const next2 = jest.fn();
    requireInternalKey(mockReq({ headers: { 'x-internal-key': 'wrong-key' } }), {}, next2);
    expect(next2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('accepts a matching key from the header', async () => {
    process.env.INTERNAL_API_KEY = 'expected-key';
    const next = jest.fn();
    requireInternalKey(mockReq({ headers: { 'x-internal-key': 'expected-key' } }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('accepts a matching key from the query string', async () => {
    process.env.INTERNAL_API_KEY = 'expected-key';
    const next = jest.fn();
    requireInternalKey(mockReq({ headers: {}, query: { internalKey: 'expected-key' } }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
