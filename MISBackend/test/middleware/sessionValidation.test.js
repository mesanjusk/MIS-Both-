/**
 * Tokens live 45 days and used to be trusted on their signature alone, so a
 * deleted or demoted user kept working until the token expired. The audit
 * reproduced a 200 for a token carrying an admin claim when no such user
 * existed, and for a deleted staff user through the permission guard.
 */
jest.mock('../../src/repositories/users');

const Users = require('../../src/repositories/users');
const jwt   = require('jsonwebtoken');
const { requireAuth, optionalAuth } = require('../../src/middleware/auth');
const { requirePermission } = require('../../src/middleware/requirePermission');

process.env.ACCESS_TOKEN_SECRET = 'test-secret';

const sign = (payload) => jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET);

/** The row requireAuth will read for the token's subject; null = deleted. */
const mockUserRow = (row) => {
  Users.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(row) }),
  });
};

const reqWith = (token) => ({ headers: { authorization: `Bearer ${token}` }, originalUrl: '/api/x' });

beforeEach(() => jest.clearAllMocks());

describe('requireAuth checks the account behind the token', () => {
  test('rejects a token whose user no longer exists', async () => {
    mockUserRow(null);
    const next = jest.fn();
    await requireAuth(reqWith(sign({ id: 'gone', userGroup: 'admin', sv: 0 })), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('rejects a token issued before a session revocation', async () => {
    mockUserRow({ _id: 'u1', User_name: 'Staff', User_group: 'office user', Session_version: 3 });
    const next = jest.fn();
    await requireAuth(reqWith(sign({ id: 'u1', sv: 2 })), {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: expect.stringMatching(/expired/i) })
    );
  });

  test('accepts a token whose session version still matches', async () => {
    mockUserRow({ _id: 'u1', User_name: 'Staff', User_group: 'office user', Session_version: 3 });
    const req = reqWith(sign({ id: 'u1', sv: 3 }));
    const next = jest.fn();
    await requireAuth(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user.userName).toBe('Staff');
  });

  test('uses the current role, not the role written into the token', async () => {
    // Token still claims admin; the account has since been demoted.
    mockUserRow({ _id: 'u1', User_name: 'Staff', User_group: 'worker', Session_version: 0 });
    const req = reqWith(sign({ id: 'u1', userGroup: 'admin', sv: 0 }));
    await requireAuth(req, {}, jest.fn());
    expect(req.user.userGroup).toBe('worker');
  });

  test('a demoted admin no longer passes a permission check by token role', async () => {
    mockUserRow({
      _id: 'u1', User_name: 'Staff', User_group: 'worker', Session_version: 0,
      permissions: { canDeleteTransactions: false },
    });
    const req = reqWith(sign({ id: 'u1', userGroup: 'admin', sv: 0 }));
    await requireAuth(req, {}, jest.fn());

    const next = jest.fn();
    await requirePermission('canDeleteTransactions')(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('caches permissions so a following check does not re-query', async () => {
    mockUserRow({
      _id: 'u1', User_name: 'Staff', User_group: 'office user', Session_version: 0,
      permissions: { canExportData: true },
    });
    const req = reqWith(sign({ id: 'u1', sv: 0 }));
    await requireAuth(req, {}, jest.fn());
    Users.findById.mockClear();

    await requirePermission('canExportData')(req, {}, jest.fn());
    expect(Users.findById).not.toHaveBeenCalled();
  });

  test('still rejects a missing header and a bad signature', async () => {
    const noHeader = jest.fn();
    await requireAuth({ headers: {}, originalUrl: '/x' }, {}, noHeader);
    expect(noHeader).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));

    const badSig = jest.fn();
    await requireAuth(reqWith(jwt.sign({ id: 'u1' }, 'wrong-secret')), {}, badSig);
    expect(badSig).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('requirePermission fails closed on a missing account', () => {
  test('a token for a deleted user is refused, not treated as unrestricted', async () => {
    // Reaching the guard directly, without the cached permissions requireAuth
    // would have set — the shape the audit probe exercised.
    mockUserRow(null);
    const next = jest.fn();
    await requirePermission('canViewAccounts')(
      { user: { id: 'gone', userGroup: 'office user' } }, {}, next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('optionalAuth', () => {
  test('leaves the caller unidentified when the session is revoked', async () => {
    mockUserRow(null);
    const req = reqWith(sign({ id: 'gone', sv: 0 }));
    const next = jest.fn();
    await optionalAuth(req, {}, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  test('identifies the caller when the session is valid', async () => {
    mockUserRow({ _id: 'u1', User_name: 'Staff', User_group: 'worker', Session_version: 0 });
    const req = reqWith(sign({ id: 'u1', sv: 0 }));
    await optionalAuth(req, {}, jest.fn());
    expect(req.user.userName).toBe('Staff');
  });
});
