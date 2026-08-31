// What an administrator must not be able to switch off, and what a deploy must
// not switch back on.
//
// The page/API switches in Admin → API Performance are deliberately powerful:
// they retire a screen or an endpoint without a deploy. Two things keep that
// from becoming a way to lock everyone out or to break a link already sent to
// a customer.

const {
  isProtected,
  PROTECTED_PREFIXES,
  compilePath,
  _setDisabledKeys,
  featureToggleMiddleware,
} = require('../../src/middleware/featureToggle');
const { PAGES } = require('../../src/constants/frontendPages');
const {
  DEFAULT_DISABLED_APIS,
  DEFAULT_DISABLED_PAGES,
} = require('../../src/constants/defaultFeatureToggles');

describe('endpoints that can never be switched off', () => {
  test.each([
    ['signing in', '/api/users/login'],
    ['the toggle screen itself', '/api/api-usage/toggles'],
    ['user groups, which the login response needs', '/api/usergroup'],
    ['the public invoice link sent to customers', '/api/public-invoices/p/some-token'],
    ['the public UPI collection link', '/api/upi/public/some-ref'],
    ['the Meta webhook', '/webhook'],
    ['the Google Drive OAuth callback', '/api/google-drive/callback'],
    ['the Gmail OAuth callback', '/api/gmail/callback'],
  ])('%s (%s) is protected', (_label, path) => {
    expect(isProtected(path)).toBe(true);
  });

  test('an ordinary endpoint is not protected, or the switches would do nothing', () => {
    expect(isProtected('/api/orders/GetOrderList')).toBe(false);
    expect(isProtected('/api/design-files/renumber')).toBe(false);
  });

  test('protection is by path segment, not by string prefix', () => {
    // '/api/usergroups-something' must not inherit '/api/usergroup' protection.
    expect(isProtected('/api/usergroup')).toBe(true);
    expect(isProtected('/api/usergroup/list')).toBe(true);
    expect(isProtected('/api/usergroupsomething')).toBe(false);
  });

  test('the dead registration prefix is gone, since no such endpoint exists', () => {
    // Public registration was removed; leaving the entry would imply an
    // endpoint that anyone reading this list would assume was live.
    expect(PROTECTED_PREFIXES).not.toContain('/api/users/register');
  });

  test('a protected path is served even when it is explicitly in the disabled set', () => {
    _setDisabledKeys(['POST /api/users/login']);
    const req = { method: 'POST', path: '/api/users/login' };
    const next = jest.fn();
    featureToggleMiddleware(req, { status: () => ({ json: () => {} }) }, next);
    expect(next).toHaveBeenCalled();
    _setDisabledKeys([]);
  });
});

describe('pages that can never be switched off', () => {
  const locked = PAGES.filter((page) => page.locked).map((page) => page.path);

  test.each([
    ['the login screen', '/login'],
    ['the root redirect', '/'],
    ['the home dashboard', '/home'],
    ['the screen that holds the switches', '/reports/api-performance'],
    ['the public invoice page', '/invoice/:shareToken'],
    ['the public UPI collection page', '/upi/collect/:transactionRef'],
  ])('%s (%s) is locked', (_label, path) => {
    expect(locked).toContain(path);
  });

  test('/register stays locked as a redirect, not switchable', () => {
    // It is no longer a page — it only forwards to /login so old bookmarks
    // land somewhere. Switching it off would break the redirect, not retire
    // a screen.
    expect(locked).toContain('/register');
  });

  test('most pages remain switchable, or the feature would be pointless', () => {
    expect(locked.length).toBeLessThan(PAGES.length / 2);
  });
});

describe('the default-disabled set stays reversible and off core work', () => {
  // API keys are "METHOD /path"; page keys are a bare path. They are different
  // shapes on purpose — a page has no HTTP method.
  const apiKeys = DEFAULT_DISABLED_APIS.map((entry) => entry.key);
  const pageKeys = DEFAULT_DISABLED_PAGES.map((entry) => entry.key);
  const apiPath = (key) => key.slice(key.indexOf(' ') + 1);

  test('nothing protected was default-disabled', () => {
    for (const key of apiKeys) {
      expect(isProtected(apiPath(key))).toBe(false);
    }
  });

  test('every default-disabled API key is a parseable "METHOD /path" pair', () => {
    for (const key of apiKeys) {
      const space = key.indexOf(' ');
      expect(space).toBeGreaterThan(0);
      expect(apiPath(key).startsWith('/')).toBe(true);
      expect(() => compilePath(apiPath(key))).not.toThrow();
    }
  });

  test('every default-disabled page key is a bare path', () => {
    for (const key of pageKeys) {
      expect(key.startsWith('/')).toBe(true);
      expect(key).not.toMatch(/^(GET|POST|PUT|PATCH|DELETE) /);
    }
  });

  test('only maintenance and migration endpoints are default-disabled', () => {
    // Everything switched off by default is a one-shot admin utility — a
    // migration, a backfill, a seed, a cleanup. None is part of daily work.
    for (const key of apiKeys) {
      expect(key).toMatch(/migrate|backfill|seed|renumber|cleanup|temp-orders|fix-/i);
    }
  });

  test.each([
    ['marking attendance', 'POST /api/attendance/addAttendance'],
    ['listing orders', 'GET /api/orders/GetOrderList'],
    ['creating an order', 'POST /api/orders/addOrder'],
    ['recording a transaction', 'POST /api/transactions/addTransaction'],
    ['reading team operations', 'GET /api/operations/team-status'],
    ['reading responsibilities', 'GET /api/operations/responsibilities'],
    ['signing in', 'POST /api/users/login'],
  ])('%s is not default-disabled', (_label, key) => {
    expect(apiKeys).not.toContain(key);
  });

  test.each([
    ['the home dashboard', '/home'],
    ['attendance', '/attendance'],
    ['my day', '/tasks/my'],
    ['the order board', '/orders/board'],
    ['creating an order', '/orders/new'],
    ['my operations', '/operations/me'],
    ['team operations', '/operations'],
    ['responsibilities', '/operations/responsibilities'],
  ])('%s (%s) is not default-disabled', (_label, path) => {
    expect(pageKeys).not.toContain(path);
  });

  test('the default-disabled pages are the legacy duplicates, and stay reversible', () => {
    // 18 pages, switched off but present — they are kept until the API
    // telemetry window closes, and re-enabling one is a tick in Admin →
    // API Performance, not a deploy.
    expect(pageKeys).toHaveLength(18);
    expect(pageKeys).toContain('/Attendance-Report'); // legacy alias of /attendance/report
    expect(pageKeys).not.toContain('/attendance/report'); // the canonical one stays on
  });
});
