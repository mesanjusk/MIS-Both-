// Route-level behaviour of the mounted application.
//
// Covers the doors rather than the pages: what a bookmark to a removed route
// does, and which routes an unauthenticated visitor may still reach. The page
// bodies are lazy-loaded and irrelevant here — what is asserted is where the
// router puts you.

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from './App';
import { AuthProvider } from './context/AuthContext';

vi.mock('./apiClient.js', () => {
  const client = {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  };
  return { default: client, getApiBase: () => '' };
});

const renderAt = (path) => {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
};

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('public registration has been removed', () => {
  test('/register redirects to /login', async () => {
    renderAt('/register');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  test('the redirect replaces the entry, so Back does not bounce off /register', async () => {
    renderAt('/register');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    // `replace` means /register never became a history entry of its own.
    expect(window.location.pathname).not.toBe('/register');
  });

  test('no registration form is rendered anywhere on that path', async () => {
    renderAt('/register');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByRole('button', { name: /^register$/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/^name$/i)).toBeNull();
  });
});

describe('an unauthenticated visitor', () => {
  test('is sent to login when asking for a protected page directly', async () => {
    renderAt('/reports/api-performance');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  test('may still reach a public invoice link', async () => {
    renderAt('/invoice/some-share-token');
    // Stays put: this link is sent to customers who have no account at all.
    await waitFor(() => expect(window.location.pathname).toBe('/invoice/some-share-token'));
  });

  test('may still reach a public UPI collection link', async () => {
    renderAt('/upi/collect/some-transaction-ref');
    await waitFor(() =>
      expect(window.location.pathname).toBe('/upi/collect/some-transaction-ref')
    );
  });

  test('may still reach the login page itself', async () => {
    renderAt('/login');
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });
});
