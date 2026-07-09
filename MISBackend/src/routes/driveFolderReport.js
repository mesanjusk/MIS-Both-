/**
 * driveFolderReport.js  —  /api/drive-folder-report
 *
 * Lets an admin browse the connected Google Drive account's folder tree and
 * kick off a background scan of any folder, returning every file found
 * anywhere underneath it (arbitrary depth) so the frontend can build an
 * Excel report with one column per folder level + file name.
 *
 * Endpoints:
 *   GET  /api/drive-folder-report/browse?folderId=   — list immediate children (folder browser UI)
 *   POST /api/drive-folder-report/scan               — start a background scan, returns { jobId }
 *   GET  /api/drive-folder-report/scan/:jobId         — poll scan progress / fetch results
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { getAuthorizedDriveClient } = require('../services/googleDriveOAuthService');
const { listAllChildren, walkFolderTree, FOLDER_MIME } = require('../services/driveTreeExportService');
const logger = require('../utils/logger');

router.use(requireAuth, requireAdmin);

// ─── In-memory scan job store ──────────────────────────────────────────────
const jobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
  }
}

// ─── GET /browse ────────────────────────────────────────────────────────────
router.get('/browse', async (req, res) => {
  try {
    const folderId = req.query.folderId || 'root';
    const drive = await getAuthorizedDriveClient();
    const children = await listAllChildren(drive, folderId);

    const folders = children
      .filter((c) => c.mimeType === FOLDER_MIME)
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const files = children
      .filter((c) => c.mimeType !== FOLDER_MIME)
      .map((c) => ({ id: c.id, name: c.name }));

    let folderName = 'My Drive';
    if (folderId !== 'root') {
      const meta = await drive.files.get({
        fileId: folderId,
        fields: 'id,name',
        supportsAllDrives: true,
      });
      folderName = meta.data.name;
    }

    return res.json({ success: true, folderId, folderName, folders, files });
  } catch (err) {
    logger.error({ err }, 'drive-folder-report/browse error');
    if (err?.reconnectRequired) {
      return res.status(401).json({ success: false, message: 'Google Drive disconnected. Please reconnect.', reconnectRequired: true });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /scan ─────────────────────────────────────────────────────────────
router.post('/scan', async (req, res) => {
  try {
    const { folderId, folderName } = req.body || {};
    if (!folderId) return res.status(400).json({ success: false, message: 'folderId required' });

    cleanupOldJobs();

    const jobId = crypto.randomUUID();
    const job = {
      status: 'running',
      folderId,
      folderName: folderName || folderId,
      foldersScanned: 0,
      filesFound: 0,
      rows: null,
      maxDepth: 0,
      error: null,
      updatedAt: Date.now(),
    };
    jobs.set(jobId, job);

    // Fire and forget — client polls GET /scan/:jobId for progress/result.
    (async () => {
      try {
        const drive = await getAuthorizedDriveClient();
        const result = await walkFolderTree({
          drive,
          rootFolderId: folderId,
          rootLabel: job.folderName,
          onProgress: ({ foldersScanned, filesFound }) => {
            job.foldersScanned = foldersScanned;
            job.filesFound = filesFound;
            job.updatedAt = Date.now();
          },
        });
        job.status = 'done';
        job.rows = result.rows;
        job.foldersScanned = result.foldersScanned;
        job.filesFound = result.filesFound;
        job.maxDepth = result.maxDepth;
        job.updatedAt = Date.now();
      } catch (err) {
        logger.error({ err }, 'drive-folder-report scan job failed');
        job.status = 'error';
        job.error = err?.reconnectRequired
          ? 'Google Drive disconnected. Please reconnect.'
          : (err.message || 'Scan failed');
        job.updatedAt = Date.now();
      }
    })();

    return res.json({ success: true, jobId });
  } catch (err) {
    logger.error({ err }, 'drive-folder-report/scan error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /scan/:jobId ───────────────────────────────────────────────────────
router.get('/scan/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, message: 'Job not found or expired' });

  const { status, folderName, foldersScanned, filesFound, maxDepth, error } = job;
  const payload = { success: true, status, folderName, foldersScanned, filesFound, maxDepth, error };
  if (status === 'done') payload.rows = job.rows;
  return res.json(payload);
});

module.exports = router;
