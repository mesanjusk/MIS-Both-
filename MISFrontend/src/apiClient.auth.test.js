import { describe, expect, it } from 'vitest';
import { isCurrentSessionRejected } from './apiClient';

const rejected = (status, code, sentToken = 'current', url = '/api/orders') => ({
  response: { status, data: { code } },
  config: { url, headers: { Authorization: `Bearer ${sentToken}` } },
});

describe('session rejection handling', () => {
  it('logs out only when the backend rejects the active MIS token', () => {
    expect(isCurrentSessionRejected(rejected(401, 'AUTH_SESSION_INVALID'), 'current')).toBe(true);
  });

  it('does not log out for unrelated integration 401s or permission errors', () => {
    expect(isCurrentSessionRejected(rejected(401, undefined), 'current')).toBe(false);
    expect(isCurrentSessionRejected(rejected(403, 'AUTH_SESSION_INVALID'), 'current')).toBe(false);
  });

  it('does not log out after a token has been replaced', () => {
    expect(isCurrentSessionRejected(rejected(401, 'AUTH_SESSION_INVALID', 'old'), 'current')).toBe(false);
  });

  it('does not redirect in response to the login endpoint', () => {
    expect(isCurrentSessionRejected(rejected(401, 'AUTH_SESSION_INVALID', 'current', '/api/users/login'), 'current')).toBe(false);
  });
});
