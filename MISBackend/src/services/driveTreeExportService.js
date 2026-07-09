/**
 * driveTreeExportService.js
 *
 * Recursively walks a Google Drive folder of arbitrary depth and flattens
 * every file found into rows of { pathSegments, fileName, extension,
 * modifiedTime, size } — used to build the "Drive Folder Report" Excel export.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const WALK_CONCURRENCY = 6;

/** List ALL immediate children of a Drive folder, following pageToken to avoid truncation. */
async function listAllChildren(drive, folderId) {
  const children = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    children.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return children;
}

/** Runs fn over items with at most `limit` concurrent in-flight calls. */
async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
}

function extensionOf(name = '') {
  const m = String(name).match(/\.([^.\\/]+)$/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Recursively walks rootFolderId, calling onProgress periodically.
 * Returns { rows, foldersScanned, filesFound, maxDepth }.
 * rows[].pathSegments includes the root folder's own label as segment 1.
 */
async function walkFolderTree({ drive, rootFolderId, rootLabel, onProgress }) {
  const rows = [];
  let foldersScanned = 0;
  let filesFound = 0;
  let maxDepth = 0;

  async function walk(folderId, pathSegments) {
    const children = await listAllChildren(drive, folderId);
    foldersScanned += 1;
    maxDepth = Math.max(maxDepth, pathSegments.length);

    const subfolders = [];
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        subfolders.push(child);
        continue;
      }
      rows.push({
        pathSegments: [...pathSegments],
        fileName: child.name,
        extension: extensionOf(child.name),
        modifiedTime: child.modifiedTime || null,
        size: child.size ? Number(child.size) : null,
      });
      filesFound += 1;
    }

    if (onProgress) onProgress({ foldersScanned, filesFound });

    await mapWithConcurrency(subfolders, WALK_CONCURRENCY, (sub) =>
      walk(sub.id, [...pathSegments, sub.name])
    );
  }

  await walk(rootFolderId, [rootLabel]);
  return { rows, foldersScanned, filesFound, maxDepth };
}

module.exports = { listAllChildren, walkFolderTree, FOLDER_MIME };
