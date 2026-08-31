// The deployed-commit identifier on the health endpoint.
//
// A health endpoint is unauthenticated, so everything it returns is public.
// These tests pin what may appear there: a short commit SHA, or nothing.

const { getReleaseId, getHealthPayload, COMMIT_VARS } = require('../../src/utils/releaseInfo');

const clearAll = () => COMMIT_VARS.forEach((name) => { delete process.env[name]; });

beforeEach(clearAll);
afterAll(clearAll);

describe('getReleaseId', () => {
  test('is empty when the platform provides nothing', () => {
    expect(getReleaseId()).toBe('');
  });

  test('shortens a full commit SHA to seven characters', () => {
    process.env.RENDER_GIT_COMMIT = '1b5bcb27f3c9a4e5d6b8a0c1e2f3a4b5c6d7e8f9';
    expect(getReleaseId()).toBe('1b5bcb2');
  });

  test('accepts an already-short SHA unchanged', () => {
    process.env.RENDER_GIT_COMMIT = 'edb0181';
    expect(getReleaseId()).toBe('edb0181');
  });

  test.each(COMMIT_VARS)('reads %s', (name) => {
    process.env[name] = 'abcdef1234567890';
    expect(getReleaseId()).toBe('abcdef1');
  });

  test('lowercases, so the value is stable however the host formats it', () => {
    process.env.RENDER_GIT_COMMIT = 'ABCDEF1234567890';
    expect(getReleaseId()).toBe('abcdef1');
  });

  test.each([
    ['a branch ref', 'refs/heads/main'],
    ['a URL', 'https://example.com/repo'],
    ['a sentence', 'not a commit'],
    ['too short', 'abc'],
    ['non-hex', 'zzzzzzz'],
    ['whitespace', '   '],
  ])('refuses %s rather than echoing an arbitrary env value', (_label, value) => {
    process.env.RENDER_GIT_COMMIT = value;
    expect(getReleaseId()).toBe('');
  });
});

describe('getHealthPayload', () => {
  test('omits release entirely when unknown, rather than sending an empty one', () => {
    expect(getHealthPayload()).toEqual({ ok: true, service: 'MIS Backend' });
    expect(getHealthPayload()).not.toHaveProperty('release');
  });

  test('includes the short SHA when the host supplies it', () => {
    process.env.RENDER_GIT_COMMIT = '1b5bcb27f3c9a4e5d6b8a0c1e2f3a4b5c6d7e8f9';
    expect(getHealthPayload()).toEqual({ ok: true, service: 'MIS Backend', release: '1b5bcb2' });
  });

  test('exposes nothing beyond ok, service and release', () => {
    process.env.RENDER_GIT_COMMIT = 'edb0181aaaa';
    // A health endpoint is public. Database status, versions, config and
    // environment values must never be added here.
    expect(Object.keys(getHealthPayload()).sort()).toEqual(['ok', 'release', 'service']);
  });

  test('leaks no other environment value even when many are set', () => {
    process.env.MONGO_URI = 'mongodb+srv://REDACTED-FAKE-VALUE-FOR-TEST/db';
    process.env.ACCESS_TOKEN_SECRET = 'super-secret';
    const serialised = JSON.stringify(getHealthPayload());
    expect(serialised).not.toMatch(/mongodb/i);
    expect(serialised).not.toMatch(/secret/i);
    delete process.env.MONGO_URI;
    delete process.env.ACCESS_TOKEN_SECRET;
  });
});
