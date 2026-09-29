import { joinWindowsPath, normalizeWindowsPath } from '../../utils/localFileLauncher';

/**
 * The network-files resolver returns the path of a specific Drive file.
 * Open its parent folder, never the file and never an unrelated share root.
 * Reject unresolved paths rather than silently opening the wrong folder.
 */
export function getWorkflowLocalFolderPath(resolved) {
  if (!resolved || resolved.driveLookupFailed || resolved.anchorFound === false) return '';

  const root = normalizeWindowsPath(resolved.networkShareRoot);
  const relative = String(resolved.relativePath || '').trim();
  if (!root || !relative || /^[\\/]/.test(relative) || /^[A-Za-z]:/.test(relative)) return '';

  const segments = relative.replace(/\//g, '\\').split('\\');
  if (segments.some((part) => !part || part === '.' || part === '..' || /[:*?"<>|]/.test(part))) return '';

  // The final segment is the file name; a file directly in the share root
  // correctly opens the root itself.
  return joinWindowsPath(root, ...segments.slice(0, -1));
}
