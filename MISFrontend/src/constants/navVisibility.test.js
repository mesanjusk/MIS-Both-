// One visibility decision, shared by every navigation surface.
//
// The desktop dropdowns, the left rail and the mobile bottom bar each used to
// filter menu entries their own way. That is how a link showed on one surface
// and not another, and how the menus drifted away from what the routes
// actually permitted.

import { describe, expect, test } from 'vitest';

import { isNavItemVisible, visibleSectionItems } from './navVisibility';
import { ACCOUNT_ROLES, ADMIN_ROLES, OFFICE_ROLES, isRoleAllowed, normalizeRoleKey } from './roles';
import { PRIMARY_NAV, SIDEBAR_GROUPS, itemsForSection } from './sidebarMenu';

const allConfigured = { socialAny: true, gmail: true, flowBuilder: true };
const ctx = (over = {}) => ({
  roleKey: 'Admin',
  allowedGroups: [],
  isPageDisabled: () => false,
  moduleConfig: allConfigured,
  ...over,
});

const item = (over = {}) => ({ label: 'X', path: '/x', roles: ADMIN_ROLES, groupLabel: 'Admin', ...over });

describe('role', () => {
  test('an entry outside the role is hidden', () => {
    expect(isNavItemVisible(item(), ctx({ roleKey: 'OfficeStaff' }))).toBe(false);
  });

  test('an entry inside the role is shown', () => {
    expect(isNavItemVisible(item({ roles: OFFICE_ROLES }), ctx({ roleKey: 'OfficeStaff' }))).toBe(true);
  });

  test("an 'all' entry is shown to everyone signed in", () => {
    expect(isNavItemVisible(item({ roles: ['all'] }), ctx({ roleKey: 'Designer' }))).toBe(true);
  });

  test('an Accounts entry is hidden from office staff and shown to Accounts', () => {
    const accountsItem = item({ roles: ACCOUNT_ROLES, groupLabel: 'Account Reports' });
    expect(isNavItemVisible(accountsItem, ctx({ roleKey: 'OfficeStaff' }))).toBe(false);
    expect(isNavItemVisible(accountsItem, ctx({ roleKey: 'Accounts' }))).toBe(true);
  });
});

describe('the per-user sidebar group allowlist', () => {
  test('an empty allowlist means no restriction, not "nothing"', () => {
    expect(isNavItemVisible(item(), ctx({ allowedGroups: [] }))).toBe(true);
  });

  test('a group outside the allowlist is hidden', () => {
    expect(isNavItemVisible(item(), ctx({ allowedGroups: ['Operations'] }))).toBe(false);
  });

  test('a group inside the allowlist is shown', () => {
    expect(isNavItemVisible(item(), ctx({ allowedGroups: ['Admin', 'Operations'] }))).toBe(true);
  });
});

describe('pages switched off in Admin -> API Performance', () => {
  test('a switched-off page leaves the menu', () => {
    expect(isNavItemVisible(item(), ctx({ isPageDisabled: (p) => p === '/x' }))).toBe(false);
  });

  test('other pages are unaffected', () => {
    expect(isNavItemVisible(item(), ctx({ isPageDisabled: (p) => p === '/other' }))).toBe(true);
  });
});

describe('optional modules', () => {
  test.each([
    ['social', { socialAny: false }],
    ['gmail', { gmail: false }],
    ['flowBuilder', { flowBuilder: false }],
  ])('a %s entry is hidden when that module is not configured', (module, off) => {
    const moduleConfig = { ...allConfigured, ...off };
    expect(isNavItemVisible(item({ module }), ctx({ moduleConfig }))).toBe(false);
  });

  test.each(['social', 'gmail', 'flowBuilder'])(
    'a %s entry is shown once configured',
    (module) => {
      expect(isNavItemVisible(item({ module }), ctx())).toBe(true);
    }
  );

  test('missing config hides optional modules rather than offering broken links', () => {
    // Fail closed: a hidden link is recoverable, a link that always errors
    // teaches people the menu cannot be trusted.
    for (const module of ['social', 'gmail', 'flowBuilder']) {
      expect(isNavItemVisible(item({ module }), ctx({ moduleConfig: undefined }))).toBe(false);
    }
  });

  test('an entry with no module is never gated on configuration', () => {
    expect(isNavItemVisible(item(), ctx({ moduleConfig: undefined }))).toBe(true);
  });
});

describe('the primary navigation', () => {
  test('is the seven agreed headings, in order', () => {
    expect(PRIMARY_NAV.map((entry) => entry.label)).toEqual([
      'Home', 'My Work', 'Orders', 'Production', 'Money', 'Communicate', 'Admin',
    ]);
  });

  test('every menu entry belongs to exactly one heading', () => {
    const sections = new Set(PRIMARY_NAV.map((entry) => entry.section));
    const orphans = SIDEBAR_GROUPS.flatMap((g) => g.items)
      .filter((i) => !sections.has(i.section))
      .map((i) => i.label);
    expect(orphans).toEqual([]);
  });

  test('no heading is empty for an Admin', () => {
    for (const entry of PRIMARY_NAV) {
      if (entry.directPath) continue;
      expect(visibleSectionItems(itemsForSection(entry.section), ctx()).length).toBeGreaterThan(0);
    }
  });

  test('Home is a direct link, not a dropdown', () => {
    expect(PRIMARY_NAV.find((e) => e.label === 'Home').directPath).toBe('/home');
  });

  test('the older dropdown names are recorded, so hidden preferences survive', () => {
    const legacy = PRIMARY_NAV.flatMap((entry) => entry.legacy || []);
    // Every heading the previous navigation had must map forward to something.
    for (const old of ['Attendance', 'Orders', 'Accounts', 'Reports', 'WhatsApp',
                       'Social', 'Call Logs', 'Operations', 'SOP', 'Admin']) {
      expect(legacy).toContain(old);
    }
  });
});

describe('ordinary staff keep their own work', () => {
  // Consolidating the menu must not take away the screens P1-P4 staff use.
  const staff = ctx({ roleKey: 'OfficeStaff' });

  test.each([
    ['attendance', '/attendance'],
    ['my day', '/tasks/my'],
    ['my operations', '/operations/me'],
    ['SOP tasks', '/sop'],
  ])('%s stays visible under My Work', (_label, path) => {
    const paths = visibleSectionItems(itemsForSection('my-work'), staff).map((i) => i.path);
    expect(paths).toContain(path);
  });

  test('the Admin heading is empty for ordinary staff', () => {
    expect(visibleSectionItems(itemsForSection('admin'), staff)).toEqual([]);
  });

  test('the Money heading is empty for ordinary staff', () => {
    expect(visibleSectionItems(itemsForSection('money'), staff)).toEqual([]);
  });

  test('an Accounts user sees Money but not Admin', () => {
    const accounts = ctx({ roleKey: 'Accounts' });
    expect(visibleSectionItems(itemsForSection('money'), accounts).length).toBeGreaterThan(0);
    expect(visibleSectionItems(itemsForSection('admin'), accounts)).toEqual([]);
  });
});

describe('detail and edit routes stay out of the menus', () => {
  test('no menu entry points at a parameterised route', () => {
    const withParams = SIDEBAR_GROUPS.flatMap((g) => g.items)
      .filter((i) => typeof i.path === 'string' && i.path.includes(':'))
      .map((i) => i.label);
    expect(withParams).toEqual([]);
  });
});

describe('the order surfaces were consolidated, not duplicated', () => {
  test('no menu entry still points at the retired Business Control page', () => {
    // Its queues live on the dashboard now and /business-control only
    // redirects. A menu entry pointing at a redirect is a dead link that looks
    // alive.
    const paths = SIDEBAR_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(paths).not.toContain('/business-control');
  });

  test('the Operations Center / Team Operations name collision is gone', () => {
    const labels = SIDEBAR_GROUPS.flatMap((g) => g.items).map((i) => i.label);
    expect(labels).not.toContain('Operations Center');
    // Team Operations — the unrelated P1-P4 module — keeps its name.
    expect(labels).toContain('Team Operations');
  });

  test('Business Profile sits under Admin, not among the order queues', () => {
    const entry = SIDEBAR_GROUPS.flatMap((g) => g.items)
      .find((i) => i.label === 'Business Profile');
    expect(entry).toBeDefined();
    expect(entry.section).toBe('admin');
    expect(entry.path).toBe('/admin/business-profile');
  });

  test('Business Profile is Admin-only', () => {
    const entry = SIDEBAR_GROUPS.flatMap((g) => g.items)
      .find((i) => i.label === 'Business Profile');
    expect(isNavItemVisible({ ...entry, groupLabel: 'Admin' }, ctx({ roleKey: 'OfficeStaff' }))).toBe(false);
    expect(isNavItemVisible({ ...entry, groupLabel: 'Admin' }, ctx({ roleKey: 'Accounts' }))).toBe(false);
    expect(isNavItemVisible({ ...entry, groupLabel: 'Admin' }, ctx({ roleKey: 'Admin' }))).toBe(true);
  });

  test('every menu path is still a real mounted route shape', () => {
    // Guards against a consolidation leaving a menu entry pointing nowhere.
    const paths = SIDEBAR_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    for (const path of paths) {
      expect(typeof path).toBe('string');
      expect(path.startsWith('/')).toBe(true);
    }
  });
});

describe('the money surfaces use the strict admin decision', () => {
  // AuthContext exposes `isAdmin` as a substring test — normalizeRole(v).includes('admin').
  // That is true for "Office Admin" and FALSE for "Owner". Gating the action
  // queues or vendor payables on it would hand payment and vendor-payout
  // buttons to office staff while hiding them from the owner. Both surfaces
  // use isRoleAllowed(ADMIN_ROLES, normalizeRoleKey(group)) instead; these
  // pin the difference so nobody "simplifies" it back to isAdmin.
  const gate = (group) => isRoleAllowed(ADMIN_ROLES, normalizeRoleKey(group));

  test.each([
    ['Admin User', true],
    ['admin', true],
    ['Owner', true],
    ['owner', true],
    ['superadmin', true],
  ])('%s may reach the action queues', (group, expected) => {
    expect(gate(group)).toBe(expected);
  });

  test.each(['Office Admin', 'Office User', 'OfficeStaff', 'Accounts', 'Designer', 'DataEntry'])(
    '%s may not',
    (group) => {
      expect(gate(group)).toBe(false);
    }
  );

  test('Office Admin is admitted by the loose check but refused by this one', () => {
    // The exact trap this guards against.
    expect(String('Office Admin').toLowerCase().includes('admin')).toBe(true);
    expect(gate('Office Admin')).toBe(false);
  });

  test('Owner is refused by the loose check but admitted by this one', () => {
    expect(String('Owner').toLowerCase().includes('admin')).toBe(false);
    expect(gate('Owner')).toBe(true);
  });
});
