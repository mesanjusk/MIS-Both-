import { normalizeRoleKey } from '../constants/roles';
import { useAuth } from '../context/AuthContext';
import { getStoredToken } from '../utils/authStorage';

/**
 * The access facts a route guard or a menu needs about the current user.
 *
 * Kept out of the guard components so both the guards and the navigation can
 * read them without importing components, and so each file exports one kind of
 * thing.
 */

/** The current user's menu role key ('Admin', 'Accounts', ...), '' if signed out. */
export function useRoleKey() {
  const { userGroup } = useAuth();
  return userGroup ? normalizeRoleKey(userGroup) : '';
}

/**
 * True when a usable session exists.
 *
 * Both halves matter: a stored name with no token cannot call the API, and a
 * token with no name is the residue of a half-finished logout. Either alone is
 * treated as signed out.
 */
export function useIsAuthenticated() {
  const { userName } = useAuth();
  return Boolean(userName) && Boolean(getStoredToken());
}
