import { useAuth } from '../context/AuthContext';

/**
 * Read a per-user permission flag (the ones an admin toggles on the
 * Admin → User Permissions screen: canCreateOrders, canEditOrders,
 * canDeleteOrders, canViewReports, canViewAccounts, canExportData).
 *
 * Defaulting rule matches the backend (middleware/requirePermission.js) and the
 * route guards: a flag denies ONLY when it is explicitly `false`. An unset flag
 * is allowed, so accounts whose permissions have never been edited keep working.
 *
 * Admin / owner always pass — they administer permissions and cannot lock
 * themselves out.
 *
 * These are a UX layer, not the security boundary; the API enforces the same
 * flags on every request. Hiding a button only spares the user a request that
 * would be rejected anyway.
 *
 * Usage:
 *   const canExport = usePermission('canExportData');
 *   const can = usePermissions();  can('canDeleteOrders')
 */
export function usePermissions() {
  const { permissions, isAdmin, isSuperAdmin } = useAuth();
  return (flag) => {
    if (isAdmin || isSuperAdmin) return true;
    return permissions?.[flag] !== false;
  };
}

export function usePermission(flag) {
  return usePermissions()(flag);
}

export default usePermission;
