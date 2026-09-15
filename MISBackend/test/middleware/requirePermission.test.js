const { requirePermission, requireCancelPermission } = require('../../src/middleware/requirePermission');
const Users = require('../../src/repositories/users');

// The middleware loads the acting user's permissions from the database, so the
// Users model is mocked. select().lean() is chained, so findById returns a
// thenable-ish chain resolving to the stubbed row.
jest.mock('../../src/repositories/users');

const mockUser = (permissions) => {
  Users.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(permissions === null ? null : { permissions }) }),
  });
};

const reqFor = (userGroup, body = {}) => ({
  user: { id: 'u1', userGroup },
  body,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requirePermission', () => {
  test('allows admin/owner without touching the database', async () => {
    const next = jest.fn();
    await requirePermission('canDeleteOrders')(reqFor('admin'), {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(Users.findById).not.toHaveBeenCalled();
  });

  test('denies a non-admin whose flag is explicitly false', async () => {
    mockUser({ canExportData: false });
    const next = jest.fn();
    await requirePermission('canExportData')(reqFor('office user'), {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringMatching(/canExportData/) })
    );
  });

  test('allows a non-admin whose flag is true', async () => {
    mockUser({ canExportData: true });
    const next = jest.fn();
    await requirePermission('canExportData')(reqFor('office user'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('allows when the flag is unset (permissive default)', async () => {
    mockUser({});
    const next = jest.fn();
    await requirePermission('canCreateOrders')(reqFor('worker'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('allows when the user row exists but has no permissions sub-document', async () => {
    mockUser(undefined);
    const next = jest.fn();
    await requirePermission('canEditOrders')(reqFor('worker'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('refuses when the user row is gone, rather than treating it as unrestricted', async () => {
    // A missing account used to read as an empty — and so permissive —
    // permissions object, which let a deleted user's token pass every flag.
    mockUser(null);
    const next = jest.fn();
    await requirePermission('canEditOrders')(reqFor('worker'), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('requireCancelPermission', () => {
  test('passes non-cancel status changes through untouched', async () => {
    const next = jest.fn();
    await requireCancelPermission(reqFor('worker', { Task: 'Printing' }), {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(Users.findById).not.toHaveBeenCalled();
  });

  test('gates a move to Cancel on canDeleteOrders for a non-admin', async () => {
    mockUser({ canDeleteOrders: false });
    const next = jest.fn();
    await requireCancelPermission(reqFor('office user', { Task: 'Cancel' }), {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringMatching(/canDeleteOrders/) })
    );
  });

  test('allows a move to Cancel when the user has canDeleteOrders', async () => {
    mockUser({ canDeleteOrders: true });
    const next = jest.fn();
    await requireCancelPermission(reqFor('office user', { Task: 'cancelled' }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('allows an admin to cancel without a database lookup', async () => {
    const next = jest.fn();
    await requireCancelPermission(reqFor('owner', { newStatus: 'Cancel' }), {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(Users.findById).not.toHaveBeenCalled();
  });
});
