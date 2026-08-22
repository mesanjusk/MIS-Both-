const {
  featureToggleMiddleware,
  compilePath,
  isProtected,
  PROTECTED_PREFIXES,
  _setDisabledKeys,
  _rules,
} = require('../../src/middleware/featureToggle');

/** Run the middleware against a fake request and report what happened. */
function run(method, path) {
  const outcome = { status: null, body: null, passed: false };
  const res = {
    status(code) {
      outcome.status = code;
      return this;
    },
    json(body) {
      outcome.body = body;
      return this;
    },
  };
  featureToggleMiddleware({ method, path }, res, () => {
    outcome.passed = true;
  });
  return outcome;
}

afterEach(() => _setDisabledKeys([]));

describe('compilePath', () => {
  it('matches a parameter against exactly one segment', () => {
    const pattern = compilePath('/api/orders/:id');
    expect(pattern.test('/api/orders/abc123')).toBe(true);
    expect(pattern.test('/api/orders')).toBe(false);
    // The danger: :id swallowing a deeper path and disabling more than asked.
    expect(pattern.test('/api/orders/abc123/steps')).toBe(false);
  });

  it('does not let a literal dot match any character', () => {
    // '.' is a regex wildcard; unescaped, /api/v1.0 would also disable
    // /api/v1x0. Paths come from route definitions, but this is cheap.
    const pattern = compilePath('/api/v1.0/thing');
    expect(pattern.test('/api/v1.0/thing')).toBe(true);
    expect(pattern.test('/api/v1x0/thing')).toBe(false);
  });

  it('tolerates a trailing slash', () => {
    expect(compilePath('/api/orders').test('/api/orders/')).toBe(true);
  });
});

describe('the middleware', () => {
  it('passes everything through when nothing is switched off', () => {
    expect(run('GET', '/api/orders').passed).toBe(true);
    expect(_rules()).toHaveLength(0);
  });

  it('answers 410 for a disabled endpoint', () => {
    _setDisabledKeys(['GET /api/orders/:id']);
    const outcome = run('GET', '/api/orders/abc');

    expect(outcome.passed).toBe(false);
    expect(outcome.status).toBe(410);
    expect(outcome.body.disabled).toBe(true);
    // The message has to tell whoever hits it how to undo this.
    expect(outcome.body.message).toContain('API Performance');
  });

  it('only blocks the method that was switched off', () => {
    _setDisabledKeys(['GET /api/orders']);
    expect(run('GET', '/api/orders').status).toBe(410);
    expect(run('POST', '/api/orders').passed).toBe(true);
  });

  it('only blocks the path that was switched off', () => {
    _setDisabledKeys(['GET /api/orders']);
    expect(run('GET', '/api/items').passed).toBe(true);
  });
});

describe('the lockout guard', () => {
  it('protects the screen that does the switching', () => {
    // Without this, one tick disables the toggle API and the only way back is
    // a mongo shell.
    _setDisabledKeys(['GET /api/api-usage/report', 'POST /api/api-usage/toggle']);

    expect(run('GET', '/api/api-usage/report').passed).toBe(true);
    expect(run('POST', '/api/api-usage/toggle').passed).toBe(true);
    // The rule is dropped at compile time, not merely skipped at match time.
    expect(_rules()).toHaveLength(0);
  });

  it('protects signing in and the WhatsApp webhook', () => {
    _setDisabledKeys(['POST /api/users/login', 'POST /webhook']);
    expect(run('POST', '/api/users/login').passed).toBe(true);
    // Meta calls /webhook directly; a 410 would break WhatsApp silently.
    expect(run('POST', '/webhook').passed).toBe(true);
  });

  it('names every protected prefix', () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(isProtected(prefix)).toBe(true);
      expect(isProtected(`${prefix}/anything`)).toBe(true);
    }
  });

  it('does not protect a path that merely starts with the same letters', () => {
    // '/api/usergroup' is protected; '/api/usergroups-archive' is not the
    // same thing and must stay switchable.
    expect(isProtected('/api/usergroup')).toBe(true);
    expect(isProtected('/api/usergroups-archive')).toBe(false);
  });
});
