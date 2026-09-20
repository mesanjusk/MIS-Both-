import { PowerOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { usePageToggles } from '../hooks/usePageToggles';

/**
 * Stops a switched-off page from loading, even via a bookmark.
 *
 * Hiding a page from the menus is not the same as switching it off — the URL
 * still works, and the people most likely to have a screen bookmarked are the
 * ones who used it most. This wraps the routed area so both doors close
 * together.
 *
 * It renders children until the answer is known. The alternative — a spinner
 * on every navigation while a toggle list loads — would slow the whole app
 * down to enforce something that is almost always empty, and the API behind
 * the page enforces its own switch regardless.
 */
export default function PageToggleGuard({ children, pathname: pathnameOverride, active = true }) {
  const { pathname: currentPathname } = useLocation();
  const pathname = pathnameOverride || currentPathname;
  const { isPageDisabled, togglesLoaded } = usePageToggles();

  // Cached routes stay mounted while hidden. Only enforce the toggle on the
  // route the user is actively viewing, otherwise a disabled current route
  // would accidentally tear down every hidden cached screen too.
  if (!active || !togglesLoaded || !isPageDisabled(pathname)) return children;

  return (
    <div className="mx-auto max-w-md p-10 text-center">
      <PowerOff className="mx-auto mb-3 h-8 w-8 text-gray-400" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        This page is switched off
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        An administrator has taken it out of use. Nothing has been deleted — it can be switched
        back on from Admin → API Performance.
      </p>
      <p className="mt-3 font-mono text-xs text-gray-400">{pathname}</p>
    </div>
  );
}
