const { requireRole, requireAdmin, requireOfficeOrAbove } = require('../../src/middleware/authorize');

const mockReq = (userGroup) => ({ user: userGroup === undefined ? undefined : { userGroup } });

describe('authorize.requireRole', () => {
  test('blocks when the request has no resolvable role', () => {
    const next = jest.fn();
    requireRole('admin')(mockReq(undefined), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, message: expect.stringMatching(/role not found/i) }));
  });

  test('allows an exact (case-insensitive) role match', () => {
    const next = jest.fn();
    requireRole('Admin')(mockReq('admin'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('allows any role in an array of allowed roles', () => {
    const next = jest.fn();
    requireRole(['admin', 'office user'])(mockReq('Office User'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('allows a higher-tier role than the minimum required, even if not literally listed', () => {
    // requireRole(['office user']) requires tier 2; an 'owner' (tier 4) should
    // still pass via the hierarchy fallback even though 'owner' isn't in the list.
    const next = jest.fn();
    requireRole(['office user'])(mockReq('owner'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('resolves a role alias (e.g. "Admin User") through the hierarchy before comparing tiers', () => {
    const next = jest.fn();
    requireRole(['admin', 'owner', 'manager'])(mockReq('Admin User'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects a role below the required tier', () => {
    const next = jest.fn();
    requireRole(['admin'])(mockReq('worker'), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, message: expect.stringMatching(/access denied/i) }));
  });

  test('reads the role from the legacy User_group field when userGroup is absent', () => {
    const next = jest.fn();
    requireRole('admin')({ user: { User_group: 'admin' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('authorize.requireAdmin', () => {
  test.each(['admin', 'owner', 'manager'])('allows %s', (role) => {
    const next = jest.fn();
    requireAdmin(mockReq(role), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test.each(['office user', 'worker', 'delivery'])('blocks %s', (role) => {
    const next = jest.fn();
    requireAdmin(mockReq(role), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

describe('authorize.requireOfficeOrAbove', () => {
  test.each(['admin', 'owner', 'manager', 'office user'])('allows %s', (role) => {
    const next = jest.fn();
    requireOfficeOrAbove(mockReq(role), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test.each(['worker', 'delivery'])('blocks %s', (role) => {
    const next = jest.fn();
    requireOfficeOrAbove(mockReq(role), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
