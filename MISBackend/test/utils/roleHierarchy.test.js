const { ROLE_HIERARCHY, normalizeRole, resolveHierarchyRole, tierFor } = require('../../src/utils/roleHierarchy');

describe('roleHierarchy.normalizeRole', () => {
  test('trims and lowercases', () => {
    expect(normalizeRole('  Admin ')).toBe('admin');
  });

  test('handles missing input', () => {
    expect(normalizeRole(undefined)).toBe('');
    expect(normalizeRole('')).toBe('');
  });
});

describe('roleHierarchy.resolveHierarchyRole', () => {
  test('maps known aliases to their canonical hierarchy key', () => {
    expect(resolveHierarchyRole('admin user')).toBe('admin');
    expect(resolveHierarchyRole('superadmin')).toBe('admin');
    expect(resolveHierarchyRole('super admin')).toBe('admin');
  });

  test('passes through a value that is already a canonical key or unknown', () => {
    expect(resolveHierarchyRole('manager')).toBe('manager');
    expect(resolveHierarchyRole('something-unknown')).toBe('something-unknown');
  });
});

describe('roleHierarchy.tierFor', () => {
  test('resolves the tier for every known role, case/whitespace-insensitively', () => {
    expect(tierFor(' Admin ')).toBe(ROLE_HIERARCHY.admin);
    expect(tierFor('Owner')).toBe(ROLE_HIERARCHY.owner);
    expect(tierFor('Manager')).toBe(ROLE_HIERARCHY.manager);
    expect(tierFor('Office User')).toBe(ROLE_HIERARCHY['office user']);
    expect(tierFor('Worker')).toBe(ROLE_HIERARCHY.worker);
    expect(tierFor('Delivery')).toBe(ROLE_HIERARCHY.delivery);
  });

  test('resolves aliased role names to the same tier as their canonical role', () => {
    expect(tierFor('Admin User')).toBe(ROLE_HIERARCHY.admin);
    expect(tierFor('SuperAdmin')).toBe(ROLE_HIERARCHY.admin);
  });

  test('returns 0 for an unrecognized role', () => {
    expect(tierFor('intern')).toBe(0);
    expect(tierFor('')).toBe(0);
    expect(tierFor(undefined)).toBe(0);
  });

  test('admin and owner are equal-ranked at the top tier, above manager', () => {
    expect(ROLE_HIERARCHY.admin).toBe(ROLE_HIERARCHY.owner);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.manager);
    expect(ROLE_HIERARCHY.manager).toBeGreaterThan(ROLE_HIERARCHY['office user']);
    expect(ROLE_HIERARCHY['office user']).toBeGreaterThan(ROLE_HIERARCHY.worker);
  });
});
