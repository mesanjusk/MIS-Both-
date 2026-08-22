const { requireRole } = require('../../src/middleware/authorize');

/**
 * Who can open the admin business reports, checked against the real
 * `usergroups` collection rather than against invented names.
 *
 * These eight are the live rows — exported from Mongo, `_id` and all — and the
 * list is the point of the test. Business reports show margins, what every
 * supplier costs and what each person's work is worth, so the set of groups
 * that can read them is a decision worth pinning rather than re-deriving from
 * whatever `roleHierarchy` happens to say next month.
 *
 * The trap this guards is "Office Admin". It contains the word admin, the
 * codebase has an `isAdminRole()` helper that matches on exactly that
 * substring, and it is an ordinary group. Anything that starts matching it
 * here has handed a department the company's margins.
 */
const USER_GROUPS = [
  { group: 'Office User', admin: false },
  { group: 'Admin User', admin: true },
  { group: 'Vendor', admin: false },
  { group: 'Other Office', admin: false },
  { group: 'Office Design', admin: false },
  { group: 'Office Manage', admin: false },
  { group: 'Office Marketing', admin: false },
  { group: 'Office Admin', admin: false },
];

/** Run one group through `requireRole('admin')` and report whether it passed. */
function allows(User_group) {
  let outcome = null;
  requireRole('admin')({ user: { User_group } }, {}, (err) => {
    outcome = err ? 'denied' : 'allowed';
  });
  return outcome === 'allowed';
}

describe('admin business reports — access by user group', () => {
  it.each(USER_GROUPS)('$group → $admin', ({ group, admin }) => {
    expect(allows(group)).toBe(admin);
  });

  it('lets exactly one of the eight groups in', () => {
    const allowed = USER_GROUPS.filter(({ group }) => allows(group)).map((g) => g.group);
    expect(allowed).toEqual(['Admin User']);
  });

  it('does not let "Office Admin" through on the word admin', () => {
    // Stated on its own because it is the failure that would matter most and
    // the easiest one to reintroduce.
    expect(allows('Office Admin')).toBe(false);
  });

  it('is forgiving about how the group name is typed', () => {
    // The same name is entered by hand in two systems; a stray space or a
    // lowercase letter should not cost somebody their access.
    const variants = ['admin user', 'ADMIN USER', '  Admin User  '];
    expect(variants.filter(allows)).toEqual(variants);
  });

  it('denies an account with no group at all', () => {
    expect(allows('')).toBe(false);
    expect(allows(undefined)).toBe(false);
  });

  it('reads the group from either field name the token may carry', () => {
    // Tokens minted before the rename carry User_group; newer ones userGroup.
    let outcome = null;
    requireRole('admin')({ user: { userGroup: 'Admin User' } }, {}, (err) => {
      outcome = err ? 'denied' : 'allowed';
    });
    expect(outcome).toBe('allowed');
  });
});
