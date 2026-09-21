export const BILLS_LOCAL_SHARE_STORAGE_KEY = "bills_local_share_root";

export function normalizeWindowsPath(value = "") {
  let path = String(value || "").trim();
  if (!path) return "";

  path = path.replace(/^["']|["']$/g, "");

  if (/^file:\/\//i.test(path)) {
    const withoutScheme = path.replace(/^file:\/+/i, "");
    if (/^[A-Za-z]:/.test(withoutScheme)) {
      path = withoutScheme;
    } else {
      path = `\\\\${withoutScheme}`;
    }
  }

  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the literal path when it contains an unmatched percent sign.
  }
  path = path.replace(/\//g, "\\");

  // Keep a drive root such as C:\ intact; otherwise remove trailing slashes.
  if (!/^[A-Za-z]:\\$/.test(path)) {
    path = path.replace(/\\+$/g, "");
  }

  return path;
}

export function joinWindowsPath(root, ...parts) {
  const base = normalizeWindowsPath(root);
  if (!base) return "";

  const suffix = parts
    .map((part) => String(part || "").trim().replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean)
    .join("\\");

  return suffix ? `${base}\\${suffix}` : base;
}

export function getBillLocalPaths(order, shareRoot) {
  const folderPath = normalizeWindowsPath(shareRoot);
  const explicitRelativePath = String(
    order?.driveFile?.localRelativePath || order?.driveFile?.relativePath || ""
  ).trim();
  const fileName = String(order?.driveFile?.name || "").trim();

  const relativeFilePath = explicitRelativePath || fileName;
  const filePath = relativeFilePath
    ? joinWindowsPath(folderPath, relativeFilePath)
    : "";

  return { folderPath, filePath };
}

export function buildMisFileUrl(path, { select = false } = {}) {
  const target = normalizeWindowsPath(path);
  if (!target) return "";
  return `misfile://open?path=${encodeURIComponent(target)}&select=${select ? "1" : "0"}`;
}

export async function copyPathToClipboard(path) {
  const target = normalizeWindowsPath(path);
  if (!target || !navigator?.clipboard?.writeText) return false;

  try {
    await navigator.clipboard.writeText(target);
    return true;
  } catch {
    return false;
  }
}

export function launchMisFileUrl(path, options = {}) {
  const url = buildMisFileUrl(path, options);
  if (!url) return false;

  window.location.href = url;
  return true;
}
