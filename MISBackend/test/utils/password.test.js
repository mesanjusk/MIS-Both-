const { hashPassword, isHashedPassword, verifyPassword } = require('../../src/utils/password');

describe('password.hashPassword / isHashedPassword', () => {
  test('produces a scrypt-prefixed hash distinct from the plaintext', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(isHashedPassword(hash)).toBe(true);
    expect(hash).not.toBe('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  test('two hashes of the same password differ (random salt per call)', () => {
    const first = hashPassword('same-password');
    const second = hashPassword('same-password');
    expect(first).not.toBe(second);
  });

  test('a plain string is not mistaken for a hashed password', () => {
    expect(isHashedPassword('plaintext123')).toBe(false);
    expect(isHashedPassword('')).toBe(false);
    expect(isHashedPassword(undefined)).toBe(false);
  });
});

describe('password.verifyPassword', () => {
  test('accepts the correct password against its hash', () => {
    const hash = hashPassword('my-secret-pw');
    expect(verifyPassword('my-secret-pw', hash)).toBe(true);
  });

  test('rejects an incorrect password against a hash', () => {
    const hash = hashPassword('my-secret-pw');
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  test('falls back to a plain-text comparison for legacy unhashed passwords', () => {
    expect(verifyPassword('legacy-plain-pw', 'legacy-plain-pw')).toBe(true);
    expect(verifyPassword('wrong', 'legacy-plain-pw')).toBe(false);
  });

  test('returns false (not throw) for a malformed hash', () => {
    expect(verifyPassword('anything', 'scrypt$onlysalt')).toBe(false);
    expect(verifyPassword('anything', 'scrypt$')).toBe(false);
  });
});
