// Dynamic page-toggle route matching, and what must never be switchable off.
//
// A switched-off page is enforced in two places that have to agree: the
// frontend guard (PageToggleGuard -> pagePatternMatches) and the API
// (middleware/featureToggle). If the frontend matched more loosely than the
// backend, switching off one page would blank a neighbouring one; if it
// matched more loosely in the other direction, a bookmark would still open a
// page an administrator had retired.

import { describe, expect, test } from 'vitest';

import { pagePatternMatches } from './usePageToggles';
import { ROUTES } from '../constants/routes';

describe('literal paths', () => {
  test('match themselves and tolerate a trailing slash', () => {
    expect(pagePatternMatches('/reports/users', '/reports/users')).toBe(true);
    expect(pagePatternMatches('/reports/users', '/reports/users/')).toBe(true);
  });

  test('do not match a different page', () => {
    expect(pagePatternMatches('/reports/users', '/reports/tasks')).toBe(false);
  });

  test('do not match a longer path that merely starts the same', () => {
    // Switching off /reports must not take /reports/business with it.
    expect(pagePatternMatches('/reports', '/reports/business')).toBe(false);
    expect(pagePatternMatches('/orders/new', '/orders/new/extra')).toBe(false);
  });

  test('do not match a shorter prefix of themselves', () => {
    expect(pagePatternMatches('/reports/business', '/reports')).toBe(false);
  });

  test('are case-sensitive, so /allOrder and /allorder are different pages', () => {
    expect(pagePatternMatches('/allOrder', '/allorder')).toBe(false);
  });
});

describe('parameterised paths', () => {
  test('match exactly one segment in place of the parameter', () => {
    expect(pagePatternMatches('/customers/:id', '/customers/abc-123')).toBe(true);
    expect(pagePatternMatches('/vendors/:id', '/vendors/v-1')).toBe(true);
  });

  test('do not swallow a further segment', () => {
    expect(pagePatternMatches('/customers/:id', '/customers/abc-123/orders')).toBe(false);
  });

  test('do not match with the parameter segment missing', () => {
    expect(pagePatternMatches('/customers/:id', '/customers')).toBe(false);
  });

  test('match the real public routes that carry a token', () => {
    expect(pagePatternMatches(ROUTES.PUBLIC_INVOICE, '/invoice/share-token-abc')).toBe(true);
    expect(pagePatternMatches(ROUTES.UPI_COLLECT_PUBLIC, '/upi/collect/txn-ref-1')).toBe(true);
  });
});

describe('bad input is not a match', () => {
  test.each([
    [null, '/reports'],
    ['/reports', null],
    ['', '/reports'],
    ['/reports', ''],
    [undefined, undefined],
  ])('pattern %s against path %s is false, never a crash', (pattern, path) => {
    expect(pagePatternMatches(pattern, path)).toBe(false);
  });
});

describe('the routes that must stay reachable', () => {
  // These carry no session: a customer opening an invoice link, or paying by
  // UPI, has no account. Switching either off would break a link already sent
  // to a customer, so they are locked in the page registry.
  const PUBLIC = [
    ['a public invoice', ROUTES.PUBLIC_INVOICE, '/invoice/tok'],
    ['a public UPI collection', ROUTES.UPI_COLLECT_PUBLIC, '/upi/collect/ref'],
  ];

  test.each(PUBLIC)('%s route is a parameterised path the matcher understands', (_label, pattern, sample) => {
    expect(pagePatternMatches(pattern, sample)).toBe(true);
  });

  test('login is a literal route, matched exactly', () => {
    expect(pagePatternMatches(ROUTES.LOGIN, '/login')).toBe(true);
    expect(pagePatternMatches(ROUTES.LOGIN, '/login/anything')).toBe(false);
  });
});
