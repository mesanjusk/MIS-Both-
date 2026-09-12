import PropTypes from 'prop-types';
import { usePermission } from '../hooks/usePermission';

/**
 * Renders its children (an export/download button, or a group of them) only
 * when the current user holds the `canExportData` permission. Admins/owners
 * always pass; other users are hidden the button unless an admin granted the
 * flag on Admin → User Permissions.
 *
 * This is a UX layer only. Export in this app is generated client-side from
 * data already loaded into the page, so hiding the button is the enforcement
 * point — there is no separate export endpoint to guard on the server. Keep the
 * data-view routes role-gated (they already are); this withdraws the ability to
 * pull that data out as CSV/PDF from users who should not.
 */
export default function ExportGuard({ children }) {
  const canExport = usePermission('canExportData');
  if (!canExport) return null;
  return children;
}

ExportGuard.propTypes = {
  children: PropTypes.node,
};
