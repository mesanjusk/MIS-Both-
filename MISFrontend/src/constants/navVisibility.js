import { isRoleAllowed } from './roles';

/**
 * Whether one menu entry is shown, for every navigation surface.
 *
 * The desktop dropdowns, the left rail and the mobile menu each used to decide
 * this for themselves, which is how a link ended up visible on one surface and
 * missing on another — and how the menus drifted away from what the routes
 * actually allowed. One function now answers it for all of them, and it asks
 * the same `isRoleAllowed` the route guards ask.
 *
 * Four things can hide an entry:
 *   1. the user's role does not cover it;
 *   2. an admin restricted them to certain sidebar groups;
 *   3. an admin switched the page off in Admin → API Performance;
 *   4. the deployment never configured the optional module behind it.
 */
export function isNavItemVisible(item, { roleKey, allowedGroups = [], isPageDisabled, moduleConfig }) {
  if (!isRoleAllowed(item.roles, roleKey)) return false;

  // An empty allowlist means "no restriction", not "nothing allowed".
  if (allowedGroups.length && item.groupLabel && !allowedGroups.includes(item.groupLabel)) {
    return false;
  }

  if (typeof isPageDisabled === 'function' && isPageDisabled(item.path)) return false;

  // Optional modules: hidden until their credentials exist, so the menu does
  // not offer a screen that can only report a missing environment variable.
  // Absent config is treated as not-configured, which is the safe direction —
  // a hidden link is recoverable, a broken one erodes trust in the whole menu.
  if (item.module) {
    if (item.module === 'social' && !moduleConfig?.socialAny) return false;
    if (item.module === 'gmail' && !moduleConfig?.gmail) return false;
    if (item.module === 'flowBuilder' && !moduleConfig?.flowBuilder) return false;
  }

  return true;
}

/** Filter a section's items, preserving their order. */
export function visibleSectionItems(items, context) {
  return items.filter((item) => isNavItemVisible(item, context));
}
