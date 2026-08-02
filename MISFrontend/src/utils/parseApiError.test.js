import { describe, test, expect } from 'vitest';
import { parseApiError } from './parseApiError';

describe('parseApiError', () => {
  test('returns a string response body as-is', () => {
    expect(parseApiError({ response: { data: 'Server exploded' } })).toBe('Server exploded');
  });

  test('prefers response.data.message', () => {
    expect(parseApiError({ response: { data: { message: 'Validation failed' } } })).toBe('Validation failed');
  });

  test('falls back to response.data.error.message', () => {
    expect(
      parseApiError({ response: { data: { error: { message: 'Nested error message' } } } })
    ).toBe('Nested error message');
  });

  test('falls back to the first entry in response.data.errors[]', () => {
    expect(
      parseApiError({ response: { data: { errors: [{ message: 'Field is required' }, { message: 'ignored' }] } } })
    ).toBe('Field is required');
  });

  test('falls back to a fallback message when an errors[] entry has no message', () => {
    expect(
      parseApiError({ response: { data: { errors: [{}] } } }, 'fallback text')
    ).toBe('fallback text');
  });

  test('falls back to error.message when there is no response body', () => {
    expect(parseApiError(new Error('Network Error'))).toBe('Network Error');
  });

  test('falls back to the default message when nothing is present', () => {
    expect(parseApiError({})).toBe('Something went wrong. Please try again.');
  });

  test('supports a custom fallback message', () => {
    expect(parseApiError({}, 'Custom fallback')).toBe('Custom fallback');
  });
});
