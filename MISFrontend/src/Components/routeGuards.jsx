import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';

import AccessDenied from '../Pages/AccessDenied';
import { ROUTES } from '../constants/routes';
import { ACCOUNT_ROLES, ADMIN_ROLES, isRoleAllowed } from '../constants/roles';
import { useAuth } from '../context/AuthContext';
import { useIsAuthenticated, useRoleKey } from '../hooks/useRouteAccess';

/**
 * Route-level authorization.
 *
 * Hiding a link is not access control. Every sensitive screen in this app was
 * reachable by typing its URL, because the only route guard was "is anyone
 * signed in" and the role checks lived in the menu components. These guards
 * close that gap by deciding access with the same helpers the menus use
 * (`constants/roles`), so a link that is hidden and a URL that is typed give
 * the same answer.
 *
 * These are a UX layer, not the security boundary. The API enforces its own
 * authorization on every request (`middleware/authorize.js`), and it has to:
 * anything decided in the browser can be edited in the browser. What these
 * stop is the ordinary accident — a shared bookmark, a pasted link, a
 * back-button into a screen someone no longer has access to.
 *
 * There is no loading state to guard against. `AuthContext` reads the session
 * from localStorage synchronously on first render, so the very first paint
 * already knows who the user is; there is no window in which a protected page
 * renders before the answer arrives.
 */

/**
 * Signed in, any role. Sends anonymous visitors to the login screen, keeping
 * where they were headed so login can return them there.
 */
export function RequireAuth({ children }) {
  const authenticated = useIsAuthenticated();
  const location = useLocation();

  if (!authenticated) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

RequireAuth.propTypes = { children: PropTypes.node };

/**
 * Signed in AND holding one of `roles` (menu role keys, e.g. ADMIN_ROLES).
 *
 * An unauthenticated visitor is redirected to login rather than shown the
 * denial screen — they may well have access once they sign in, and the denial
 * screen would be a dead end with no way to authenticate.
 */
export function RequireRoles({ roles, children, title }) {
  const authenticated = useIsAuthenticated();
  const roleKey = useRoleKey();
  const location = useLocation();

  if (!authenticated) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname + location.search }} />;
  }
  if (!isRoleAllowed(roles, roleKey)) {
    return <AccessDenied title={title} />;
  }
  return children;
}

RequireRoles.propTypes = {
  roles: PropTypes.arrayOf(PropTypes.string).isRequired,
  children: PropTypes.node,
  title: PropTypes.string,
};

/** Admin and Owner only — the administrative setup screens. */
export function RequireAdmin({ children }) {
  return <RequireRoles roles={ADMIN_ROLES}>{children}</RequireRoles>;
}

RequireAdmin.propTypes = { children: PropTypes.node };

/**
 * The Accounts audience: Admin, Owner and Accounts.
 *
 * Also honours the `canViewAccounts` permission flag, so an admin can withdraw
 * ledger access from one Accounts user without moving them out of the group.
 * A missing flag means allowed — permissions default to permissive on the
 * server (see DEFAULT_PERMISSIONS in AdminUserPermissions), and treating
 * "unset" as "denied" would lock out every account whose permissions have
 * never been edited.
 */
export function RequireAccounts({ children }) {
  const { permissions } = useAuth();

  if (permissions?.canViewAccounts === false) {
    return <AccessDenied title="You do not have access to the accounts area" />;
  }
  return <RequireRoles roles={ACCOUNT_ROLES}>{children}</RequireRoles>;
}

RequireAccounts.propTypes = { children: PropTypes.node };

/**
 * Gate on a named permission flag (`canViewReports`, `canExportData`, ...).
 *
 * Same defaulting rule as above: only an explicit `false` denies.
 */
export function RequirePermission({ permission, children, title }) {
  const authenticated = useIsAuthenticated();
  const { permissions } = useAuth();
  const location = useLocation();

  if (!authenticated) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname + location.search }} />;
  }
  if (permissions?.[permission] === false) {
    return <AccessDenied title={title} />;
  }
  return children;
}

RequirePermission.propTypes = {
  permission: PropTypes.string.isRequired,
  children: PropTypes.node,
  title: PropTypes.string,
};
