// Route authorization for each class of user.
//
// The rule these protect: a sensitive screen must refuse a direct URL, not
// merely be missing from the menu. Before this, every one of the routes below
// rendered for anyone holding any valid session.

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  RequireAccounts,
  RequireAdmin,
  RequireAuth,
  RequirePermission,
  RequireRoles,
} from './routeGuards';
import { ACCOUNT_ROLES, ADMIN_ROLES, OFFICE_ROLES, isRoleAllowed } from '../constants/roles';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu';
import { AuthProvider } from '../context/AuthContext';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })) },
  getApiBase: () => '',
}));

const SECRET = 'the-protected-content';

/** Put a session in localStorage exactly as the login flow does. */
function signIn(userGroup, { permissions } = {}) {
  localStorage.setItem('mis_userName', 'testuser');
  localStorage.setItem('User_name', 'testuser');
  localStorage.setItem('mis_userGroup', userGroup);
  localStorage.setItem('User_group', userGroup);
  localStorage.setItem('mis_token', 'a-token');
  if (permissions) localStorage.setItem('mis_permissions', JSON.stringify(permissions));
}

function renderGuarded(guard) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/home" element={<div>home page</div>} />
          <Route path="/protected" element={guard(<div>{SECRET}</div>)} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

const asAdmin = (el) => <RequireAdmin>{el}</RequireAdmin>;
const asAccounts = (el) => <RequireAccounts>{el}</RequireAccounts>;
const asAuth = (el) => <RequireAuth>{el}</RequireAuth>;

const expectDenied = async () => {
  await waitFor(() => expect(screen.getByText(/do not have access/i)).toBeInTheDocument());
  expect(screen.queryByText(SECRET)).toBeNull();
};
const expectAllowed = async () =>
  waitFor(() => expect(screen.getByText(SECRET)).toBeInTheDocument());
const expectSentToLogin = async () => {
  await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument());
  expect(screen.queryByText(SECRET)).toBeNull();
};

afterEach(() => localStorage.clear());

describe('a logged-out visitor', () => {
  test('is sent to login by RequireAuth, not shown the content', async () => {
    renderGuarded(asAuth);
    await expectSentToLogin();
  });

  test('is sent to login by an admin route rather than a dead-end denial', async () => {
    renderGuarded(asAdmin);
    await expectSentToLogin();
  });

  test('a stored name without a token does not count as signed in', async () => {
    localStorage.setItem('mis_userName', 'testuser');
    localStorage.setItem('User_name', 'testuser');
    renderGuarded(asAuth);
    await expectSentToLogin();
  });

  test('a token without a name does not count as signed in', async () => {
    localStorage.setItem('mis_token', 'a-token');
    renderGuarded(asAuth);
    await expectSentToLogin();
  });
});

describe('ordinary office staff', () => {
  test('reach pages that only require a session', async () => {
    signIn('Office User');
    renderGuarded(asAuth);
    await expectAllowed();
  });

  test('are refused an Admin route', async () => {
    signIn('Office User');
    renderGuarded(asAdmin);
    await expectDenied();
  });

  test('are refused the Accounts area', async () => {
    signIn('Office User');
    renderGuarded(asAccounts);
    await expectDenied();
  });

  test.each(['Designer', 'DataEntry', 'OfficeStaff', 'OfficeDesign', 'OfficeMarketing', 'Office Admin'])(
    '%s is refused an Admin route',
    async (group) => {
      signIn(group);
      renderGuarded(asAdmin);
      await expectDenied();
    }
  );

  test('the denial offers a way home rather than a dead end', async () => {
    signIn('Office User');
    renderGuarded(asAdmin);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument()
    );
  });
});

describe('an Accounts user', () => {
  test('reaches the Accounts area', async () => {
    signIn('Accounts');
    renderGuarded(asAccounts);
    await expectAllowed();
  });

  test('is still refused an Admin route', async () => {
    signIn('Accounts');
    renderGuarded(asAdmin);
    await expectDenied();
  });

  test('can have ledger access withdrawn by permission without changing their group', async () => {
    signIn('Accounts', { permissions: { canViewAccounts: false } });
    renderGuarded(asAccounts);
    await expectDenied();
  });

  test('keeps access when the permission flag is simply absent', async () => {
    // Permissions default to permissive on the server; treating "unset" as
    // "denied" would lock out every account never edited in Admin.
    signIn('Accounts', { permissions: { canViewReports: true } });
    renderGuarded(asAccounts);
    await expectAllowed();
  });
});

describe('an Admin', () => {
  test.each(['Admin User', 'admin', 'Admin'])('%s reaches an Admin route', async (group) => {
    signIn(group);
    renderGuarded(asAdmin);
    await expectAllowed();
  });

  test('also reaches the Accounts area', async () => {
    signIn('Admin User');
    renderGuarded(asAccounts);
    await expectAllowed();
  });
});

describe('an Owner', () => {
  test('reaches an Admin route', async () => {
    signIn('Owner');
    renderGuarded(asAdmin);
    await expectAllowed();
  });

  test('reaches the Accounts area', async () => {
    signIn('Owner');
    renderGuarded(asAccounts);
    await expectAllowed();
  });
});

describe('role-list and permission guards', () => {
  test('RequireRoles admits a listed role', async () => {
    signIn('Designer');
    renderGuarded((el) => <RequireRoles roles={OFFICE_ROLES}>{el}</RequireRoles>);
    await expectAllowed();
  });

  test('RequireRoles refuses an unlisted role', async () => {
    signIn('Accounts');
    renderGuarded((el) => <RequireRoles roles={OFFICE_ROLES}>{el}</RequireRoles>);
    await expectDenied();
  });

  test('RequirePermission refuses only on an explicit false', async () => {
    signIn('Office User', { permissions: { canViewReports: false } });
    renderGuarded((el) => <RequirePermission permission="canViewReports">{el}</RequirePermission>);
    await expectDenied();
  });

  test('RequirePermission admits when the flag was never set', async () => {
    signIn('Office User');
    renderGuarded((el) => <RequirePermission permission="canViewReports">{el}</RequirePermission>);
    await expectAllowed();
  });
});

describe('the menus and the guards share one decision', () => {
  // If these drift, a link appears that leads to a denial screen, or a page
  // stays hidden that the user is entitled to.
  test('every menu item is visible to Admin', () => {
    const hidden = SIDEBAR_GROUPS.flatMap((g) => g.items)
      .filter((item) => !isRoleAllowed(item.roles, 'Admin'))
      .map((item) => item.label);
    expect(hidden).toEqual([]);
  });

  test('an item with no roles list is treated as admin-only, never as public', () => {
    expect(isRoleAllowed(undefined, 'OfficeStaff')).toBe(false);
    expect(isRoleAllowed([], 'OfficeStaff')).toBe(false);
    expect(isRoleAllowed(undefined, 'Admin')).toBe(true);
  });

  test("the 'all' marker admits every signed-in role", () => {
    for (const role of ['Admin', 'Accounts', 'OfficeStaff', 'Designer', 'Whatever']) {
      expect(isRoleAllowed(['all'], role)).toBe(true);
    }
  });

  test('the audiences stay distinct', () => {
    expect(ADMIN_ROLES).not.toContain('Accounts');
    expect(ACCOUNT_ROLES).toContain('Accounts');
    expect(OFFICE_ROLES).not.toContain('Accounts');
  });
});
