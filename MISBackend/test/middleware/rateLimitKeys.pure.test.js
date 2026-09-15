/**
 * The limiter keyed on the literal request path, so one nominal limit was
 * really one limit per record, and it keyed anonymous callers on the full IP —
 * which behind a proxy is the proxy, and on IPv6 is one address out of a /64
 * the client already controls.
 */
const { normalizePath, normalizeIp } = require('../../src/middleware/rateLimit');

describe('normalizePath', () => {
  test('collapses a uuid segment', () => {
    expect(normalizePath('/transactions/2f1c9b4e-1111-4222-8333-444455556666'))
      .toBe('/transactions/:id');
  });

  test('collapses numeric ids anywhere in the path', () => {
    expect(normalizePath('/orders/12345/steps/7')).toBe('/orders/:id/steps/:id');
  });

  test('collapses long opaque tokens such as share links', () => {
    expect(normalizePath('/public-invoice/p/AbCdEf0123456789AbCdEf0123'))
      .toBe('/public-invoice/p/:id');
  });

  test('two records on one route share a bucket', () => {
    expect(normalizePath('/transactions/2f1c9b4e-1111-4222-8333-444455556666'))
      .toBe(normalizePath('/transactions/9a8b7c6d-2222-4333-8444-555566667777'));
  });

  test('leaves ordinary route segments alone', () => {
    expect(normalizePath('/users/login')).toBe('/users/login');
    expect(normalizePath('')).toBe('');
  });
});

describe('normalizeIp', () => {
  test('unwraps an IPv4-mapped IPv6 address', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  test('keeps a plain IPv4 address as-is', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9');
  });

  test('reduces IPv6 to its /64, so one client cannot rotate addresses', () => {
    const a = normalizeIp('2001:db8:1234:5678:9abc:def0:1:2');
    const b = normalizeIp('2001:db8:1234:5678:ffff:ffff:9:9');
    expect(a).toBe(b);
    expect(a).toBe('2001:db8:1234:5678::/64');
  });

  test('different /64s remain different keys', () => {
    expect(normalizeIp('2001:db8:1111:2222::1'))
      .not.toBe(normalizeIp('2001:db8:3333:4444::1'));
  });
});
