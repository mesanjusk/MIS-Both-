import { describe, expect, it } from 'vitest';

import { pagePatternMatches } from './usePageToggles';

describe('pagePatternMatches', () => {
  it('matches literal routes with an optional trailing slash', () => {
    expect(pagePatternMatches('/reports/users', '/reports/users')).toBe(true);
    expect(pagePatternMatches('/reports/users', '/reports/users/')).toBe(true);
    expect(pagePatternMatches('/reports/users', '/reports/tasks')).toBe(false);
  });

  it('matches one segment for a parameterised page route', () => {
    expect(pagePatternMatches('/customers/:id', '/customers/customer-123')).toBe(true);
    expect(pagePatternMatches('/customers/:id', '/customers/customer-123/orders')).toBe(false);
  });
});
