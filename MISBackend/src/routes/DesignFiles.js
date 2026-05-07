/**
 * DesignFiles.js  —  /api/design-files
 *
 * Watches the designer's synced Google Drive "0 Today" folder.
 * Subfolders identified by leading numeric prefix (1, 2, 3 …)
 *
 * Folder map (your actual structure):
 *   1 → New Design      2 → Old Design    3 → Approval
 *   4 → Ready2Print     5 → Hold          6 → Cancel
 *   7 → Other           8 → Final         9 → Printing
 *
 * AUTO-MATCH: Files named "153 - CustomerName - Details - Mobile"
 * Leading number = MIS Order_Number → auto-matched, zero manual work.
 *
 * Endpoints:
 *   GET /api/design-files/config-check
 *   GET /api/design-files/scan            — all files, auto-matched to orders
 *   GET /api/design-files/unmatched       — files with no matching MIS order
 *   GET /api/design-files/order/:uuid     — live stage of files for one order
 *   POST /api/design-files/auto-temp-orders — create temp orders for unmatched files
 *   GET /api/design-files/scan-archive    — scan month-wise archive folder
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getAuthorizedDriveClient } = require('../services/googleDriveOAuthService');
const Orders = require('../repositories/order');
const VendorWork = require('../repositories/vendorWork');
const VendorLedger = require('../repositories/vendorLedger');
const VendorMaster = require('../repositories/vendorMaster');
const DesignFileLink = require('../repositories/DesignFileLink');
const Customers = require('../repositories/customer');
const Counter = require('../repositories/counter');
const logger = require('../utils/logger');

router.use(requireAuth);

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGE_LABELS = {
  1: 'New Design', 2: 'Old Design', 3: 'Approval',
  4: 'Ready2Print', 5: 'Hold', 6: 'Cancel',
  7: 'Other', 8: 'Final', 9: 'Printing',
};
const STAGE_COLORS = {
  1: { bg: '#E3F2FD', color: '#0D47A1' },
  2: { bg: '#F3E5F5', color: '#4A148C' },
  3: { bg: '#FFF8E1', color: '#E65100' },
  4: { bg: '#E8F5E9', color: '#1B5E20' },
  5: { bg: '#FBE9E7', color: '#BF360C' },
  6: { bg: '#FFEBEE', color: '#B71C1C' },
  7: { bg: '#ECEFF1', color: '#37474F' },
  8: { bg: '#E0F2F1', color: '#004D40' },
  9: { bg: '#FCE4EC', color: '#880E4F' },
};
function stageLabel(n) { return STAGE_LABELS[n] || `Stage ${n}`; }
function stageColor(n) { return STAGE_COLORS[n] || { bg: '#F5F5F5', color: '#424242' }; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "2.Old Design" → 2 */
function folderStageNumber(name = '') {
  const m = String(name).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Extract MIS order number from filename.
 * Handles: "153 - Name", "153-Name", "153_Name", "ORD153", "ORD-153"
 */
function extractOrderNumber(fileName = '') {
  const m = String(fileName).match(/^(\d+)\s*[-_\s]/);
  if (m) return parseInt(m[1], 10);
  const m2 = String(fileName).match(/ORD[-]?(\d+)/i);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

/**
 * Returns true only if the filename already starts with EXACTLY the given
 * order number followed by a separator (space, dash, underscore).
 * Prevents "1534 - file.cdr" from being considered already-prefixed for order #153.
 */
function alreadyPrefixedWithOrder(fileName, orderNumber) {
  if (!fileName || orderNumber == null) return false;
  return new RegExp(`^${orderNumber}[\\s\\-_]`).test(String(fileName));
}

/**
 * Returns true for backup/temp files that should never appear in the scan.
 * Patterns:
 *   ~$*           — Office lock files (Word, Excel, CorelDraw)
 *   .*            — hidden / system dot-files
 *   *.bak *.tmp *.~ — explicit backup extensions
 *   * - Copy*     — Windows "copy" duplicates
 *   Copy of *     — macOS "copy" duplicates
 *   *(copy)*      — generic copy suffix
 *   *backup*      — any file with "backup" in the name
 *   *.lck         — lock files
 */
function isBackupFile(name = '') {
  const n = String(name);
  if (n.startsWith('~$')) return true;
  if (n.startsWith('.')) return true;
  const lower = n.toLowerCase();
  if (lower.endsWith('.bak') || lower.endsWith('.tmp') || lower.endsWith('.~') || lower.endsWith('.lck')) return true;
  if (lower.includes(' - copy') || lower.startsWith('copy of ')) return true;
  if (lower.includes('(copy)') || lower.includes('backup')) return true;
  return false;
}

/** List immediate children of a Drive folder (excludes backup files) */
async function listChildren(drive, folderId, mimeTypeFilter = null) {
  const q = [`'${folderId}' in parents`, `trashed = false`];
  if (mimeTypeFilter) q.push(`mimeType = '${mimeTypeFilter}'`);
  const res = await drive.files.list({
    q: q.join(' and '),
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    pageSize: 500,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const files = res.data.files || [];
  // Skip backup/temp files unless we are listing folders
  if (mimeTypeFilter === 'application/vnd.google-apps.folder') return files;
  return files.filter((f) => !isBackupFile(f.name));
}

/**
 * Fixed UUID reserved for the auto-generated "Temp – Design File" customer.
 * Override via TEMP_CUSTOMER_UUID env var if you want to use an existing customer.
 */
const TEMP_CUSTOMER_UUID = process.env.TEMP_CUSTOMER_UUID || 'ffffffff-0000-temp-0000-d51gn00000001';

/** Find or create the placeholder customer used for temporary orders. */
async function getOrCreateTempCustomer() {
  const existing = await Customers.findOne({ Customer_uuid: TEMP_CUSTOMER_UUID }).lean();
  if (existing) return existing;
  return Customers.create({
    Customer_uuid: TEMP_CUSTOMER_UUID,
    Customer_name: 'Temp – Design File',
    Customer_group: 'Temp',
    Mobile_number: '0000000000',
    Status: 'Active',
  });
}

/** Get the next order number using the shared counter. */
async function nextOrderNumber() {
  const lastOrder = await Orders.findOne({}, { Order_Number: 1 }).sort({ Order_Number: -1 }).lean();
  const seed = Number(lastOrder?.Order_Number || 0);
  await Counter.updateOne({ _id: 'order_number' }, { $max: { seq: seed } }, { upsert: true });
  const updated = await Counter.findByIdAndUpdate(
    'order_number',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(updated?.seq || 1);
}

// ─── New helpers ──────────────────────────────────────────────────────────────

const SUSPENSE_VENDOR_UUID = process.env.SUSPENSE_VENDOR_UUID || 'ffffffff-0000-susp-0000-v3nd0r0000001';

async function getOrCreateSuspenseVendor() {
  const existing = await VendorMaster.findOne({ Vendor_uuid: SUSPENSE_VENDOR_UUID }).lean();
  if (existing) return existing;
  return VendorMaster.create({
    Vendor_uuid: SUSPENSE_VENDOR_UUID,
    Vendor_name: 'Suspense Printer',
    Mobile_number: '0000000000',
    Vendor_type: 'mixed',
    Active: true,
  });
}

async function nextPrintJobNumber() {
  const updated = await Counter.findByIdAndUpdate(
    'print_job_number',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(updated?.seq || 1);
}

function sanitize(v) {
  return String(v || '').replace(/[\\/:*?"<>|#%{}~&]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Augment a flat file list with DesignFileLink matches for files that were not
 * auto-matched by filename. Returns the enriched array with `matched` updated.
 * Also handles draft links (no orderUuid yet) and print job metadata.
 */
async function applyLinks(enriched) {
  const unmatchedIds = enriched.filter((f) => !f.matched).map((f) => f.fileId);
  if (!unmatchedIds.length) return enriched;

  const links = await DesignFileLink.find(
    { driveFileId: { $in: unmatchedIds } },
    { driveFileId: 1, orderUuid: 1, orderNumber: 1, linkStatus: 1, customerName: 1, printJobId: 1, printJobNumber: 1 }
  ).lean();
  if (!links.length) return enriched;

  const linkMap = {};
  links.forEach((l) => { linkMap[l.driveFileId] = l; });

  const linkedUuids = links.map((l) => l.orderUuid).filter(Boolean);
  const linkedOrders = linkedUuids.length
    ? await Orders.find({ Order_uuid: { $in: linkedUuids } }, { Order_uuid: 1, Order_Number: 1, stage: 1, Amount: 1 }).lean()
    : [];
  const orderByUuid = {};
  linkedOrders.forEach((o) => { orderByUuid[o.Order_uuid] = o; });

  return enriched.map((file) => {
    if (file.matched) return file;
    const link = linkMap[file.fileId];
    if (!link) return file;

    // Draft — tracked but no order yet
    if (!link.orderUuid || link.linkStatus === 'draft') {
      return { ...file, isDraft: true, linkStatus: 'draft', linkedViaLink: true };
    }

    const order = orderByUuid[link.orderUuid];
    if (!order) return file;
    return {
      ...file,
      matched: true,
      orderUuid: order.Order_uuid,
      orderNumber: order.Order_Number,
      orderStage: order.stage,
      orderAmount: order.Amount,
      linkStatus: link.linkStatus || 'confirmed',
      linkedViaManual: true,
      printJobId: link.printJobId || null,
      printJobNumber: link.printJobNumber || null,
    };
  });
}

// ─── GET /api/design-files/config-check ──────────────────────────────────────
router.get('/config-check', (_req, res) => {
  return res.json({
    configured: !!process.env.DRIVE_DAILY_FOLDER_ID,
    archiveConfigured: !!process.env.DRIVE_ARCHIVE_FOLDER_ID,
  });
});

// ─── GET /api/design-files/scan ──────────────────────────────────────────────
router.get('/scan', async (_req, res) => {
  try {
    const dailyFolderId = process.env.DRIVE_DAILY_FOLDER_ID;
    if (!dailyFolderId) {
      return res.status(400).json({ success: false, message: 'DRIVE_DAILY_FOLDER_ID not configured' });
    }

    const drive = await getAuthorizedDriveClient();

    // 1. Get all numbered subfolders
    const allFolders = await listChildren(drive, dailyFolderId, 'application/vnd.google-apps.folder');
    const numbered = allFolders
      .map((f) => ({ ...f, stageNumber: folderStageNumber(f.name) }))
      .filter((f) => f.stageNumber !== null)
      .sort((a, b) => a.stageNumber - b.stageNumber);

    // 2. List files in all subfolders in parallel (backup files already excluded by listChildren)
    const folderScans = await Promise.all(
      numbered.map(async (folder) => {
        const files = await listChildren(drive, folder.id);
        return files.map((file) => ({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          size: file.size || null,
          folderName: folder.name,
          stageNumber: folder.stageNumber,
          stageLabel: stageLabel(folder.stageNumber),
          stageColor: stageColor(folder.stageNumber),
          extractedOrderNumber: extractOrderNumber(file.name),
        }));
      })
    );

    const allFiles = folderScans.flat();

    // 3. Batch-fetch all matching orders from MIS (by filename-extracted number)
    const orderNumbers = [...new Set(allFiles.map((f) => f.extractedOrderNumber).filter(Boolean))];
    const orders = orderNumbers.length
      ? await Orders.find(
          { Order_Number: { $in: orderNumbers } },
          { Order_uuid: 1, Order_Number: 1, stage: 1, Amount: 1, orderNote: 1, isTemporary: 1 }
        ).lean()
      : [];
    const orderByNumber = {};
    orders.forEach((o) => { orderByNumber[o.Order_Number] = o; });

    // 4. Enrich files with matched order data (filename-based matching)
    let enriched = allFiles.map((file) => {
      const order = file.extractedOrderNumber ? orderByNumber[file.extractedOrderNumber] || null : null;
      return {
        ...file,
        matched: !!order,
        orderUuid: order?.Order_uuid || null,
        orderNumber: order?.Order_Number || file.extractedOrderNumber || null,
        orderStage: order?.stage || null,
        orderAmount: order?.Amount || null,
        isTemporaryOrder: order?.isTemporary || false,
        linkedViaManual: false,
      };
    });

    // 5. For still-unmatched files, check DesignFileLink (manual links override)
    enriched = await applyLinks(enriched);

    // 6. Build summary
    const summary = {
      total: enriched.length,
      matched: enriched.filter((f) => f.matched).length,
      unmatched: enriched.filter((f) => !f.matched).length,
      byStage: {},
    };
    numbered.forEach((folder) => {
      const stageFiles = enriched.filter((f) => f.stageNumber === folder.stageNumber);
      summary.byStage[folder.stageNumber] = {
        label: stageLabel(folder.stageNumber),
        count: stageFiles.length,
        matched: stageFiles.filter((f) => f.matched).length,
      };
    });

    // 7. Stale draft links — draft records whose file is no longer visible in today's Drive scan
    const currentFileIds = new Set(enriched.map((f) => f.fileId));
    const staleLinks = await DesignFileLink.find(
      { linkStatus: 'draft', driveFileId: { $nin: [...currentFileIds] } },
      { driveFileId: 1, fileName: 1, stageNumber: 1, stageLabel: 1, linkedAt: 1 }
    ).lean();

    return res.json({ success: true, files: enriched, summary, staleLinks });
  } catch (err) {
    logger.error({ err }, 'design-files/scan error');
    if (err?.reconnectRequired) {
      return res.status(401).json({ success: false, message: 'Google Drive disconnected. Please reconnect.', reconnectRequired: true });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/design-files/unmatched ─────────────────────────────────────────
router.get('/unmatched', async (_req, res) => {
  try {
    const dailyFolderId = process.env.DRIVE_DAILY_FOLDER_ID;
    if (!dailyFolderId) {
      return res.status(400).json({ success: false, message: 'DRIVE_DAILY_FOLDER_ID not configured' });
    }
    const drive = await getAuthorizedDriveClient();
    const allFolders = await listChildren(drive, dailyFolderId, 'application/vnd.google-apps.folder');
    const numbered = allFolders
      .map((f) => ({ ...f, stageNumber: folderStageNumber(f.name) }))
      .filter((f) => f.stageNumber !== null);

    const folderScans = await Promise.all(
      numbered.map(async (folder) => {
        const files = await listChildren(drive, folder.id);
        return files.map((file) => ({
          fileId: file.id,
          fileName: file.name,
          modifiedTime: file.modifiedTime,
          stageNumber: folder.stageNumber,
          stageLabel: stageLabel(folder.stageNumber),
          stageColor: stageColor(folder.stageNumber),
          extractedOrderNumber: extractOrderNumber(file.name),
        }));
      })
    );

    const allFiles = folderScans.flat();
    const orderNumbers = [...new Set(allFiles.map((f) => f.extractedOrderNumber).filter(Boolean))];
    const found = orderNumbers.length
      ? await Orders.find({ Order_Number: { $in: orderNumbers } }, { Order_Number: 1 }).lean()
      : [];
    const foundSet = new Set(found.map((o) => o.Order_Number));

    // Also check DesignFileLink for any manually linked files
    const allFileIds = allFiles.map((f) => f.fileId);
    const manualLinks = allFileIds.length
      ? await DesignFileLink.find({ driveFileId: { $in: allFileIds } }, { driveFileId: 1 }).lean()
      : [];
    const manuallyLinkedIds = new Set(manualLinks.map((l) => l.driveFileId));

    const unmatched = allFiles.filter(
      (f) => !manuallyLinkedIds.has(f.fileId) && (!f.extractedOrderNumber || !foundSet.has(f.extractedOrderNumber))
    );
    return res.json({ success: true, files: unmatched, count: unmatched.length });
  } catch (err) {
    logger.error({ err }, 'design-files/unmatched error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/design-files/order/:orderUuid ──────────────────────────────────
router.get('/order/:orderUuid', async (req, res) => {
  try {
    const order = await Orders.findOne({ Order_uuid: req.params.orderUuid }, { Order_Number: 1 }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const dailyFolderId = process.env.DRIVE_DAILY_FOLDER_ID;
    if (!dailyFolderId) return res.json({ success: true, files: [] });

    const drive = await getAuthorizedDriveClient();
    const allFolders = await listChildren(drive, dailyFolderId, 'application/vnd.google-apps.folder');
    const numbered = allFolders
      .map((f) => ({ ...f, stageNumber: folderStageNumber(f.name) }))
      .filter((f) => f.stageNumber !== null);

    const matches = [];
    await Promise.all(
      numbered.map(async (folder) => {
        const files = await listChildren(drive, folder.id);
        files.forEach((file) => {
          if (extractOrderNumber(file.name) === order.Order_Number) {
            matches.push({
              fileId: file.id,
              fileName: file.name,
              modifiedTime: file.modifiedTime,
              stageNumber: folder.stageNumber,
              stageLabel: stageLabel(folder.stageNumber),
              stageColor: stageColor(folder.stageNumber),
              folderName: folder.name,
            });
          }
        });
      })
    );

    matches.sort((a, b) => a.stageNumber - b.stageNumber);
    return res.json({ success: true, orderNumber: order.Order_Number, files: matches });
  } catch (err) {
    logger.error({ err }, 'design-files/order error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/design-files/orders/search?q= ──────────────────────────────────
router.get('/orders/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const num = Number(q);
    const filter = q
      ? {
          $or: [
            ...(Number.isFinite(num) && num > 0 ? [{ Order_Number: num }] : []),
            { orderNote: { $regex: q, $options: 'i' } },
          ],
        }
      : {};
    const orders = await Orders.find(filter, {
      Order_uuid: 1, Order_Number: 1, orderNote: 1, stage: 1, isTemporary: 1,
    })
      .sort({ Order_Number: -1 })
      .limit(20)
      .lean();
    return res.json({ success: true, result: orders });
  } catch (err) {
    logger.error({ err }, 'design-files/orders/search error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/link-order ───────────────────────────────────────
router.post('/link-order', async (req, res) => {
  try {
    const { fileIds, orderUuid, files: filesMeta = [] } = req.body || {};
    if (!Array.isArray(fileIds) || !fileIds.length) {
      return res.status(400).json({ success: false, message: 'fileIds required' });
    }
    if (!orderUuid) {
      return res.status(400).json({ success: false, message: 'orderUuid required' });
    }

    const order = await Orders.findOne({ Order_uuid: orderUuid }, {
      Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, orderNote: 1,
    }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const metaMap = {};
    filesMeta.forEach((f) => { if (f?.fileId) metaMap[f.fileId] = f; });

    // Save link records first — link always succeeds even if rename fails
    const ops = fileIds.map((fileId) => {
      const meta = metaMap[fileId] || {};
      return {
        updateOne: {
          filter: { driveFileId: fileId },
          update: {
            $set: {
              orderUuid: order.Order_uuid,
              orderNumber: order.Order_Number,
              fileName: meta.fileName || null,
              stageNumber: meta.stageNumber || null,
              stageLabel: meta.stageLabel || null,
              linkedAt: new Date(),
            },
          },
          upsert: true,
        },
      };
    });

    await DesignFileLink.bulkWrite(ops);

    // Drive rename — isolated so it can never cause a 500 on the link itself
    const renameResults = {};
    try {
      let drive = null;
      try { drive = await getAuthorizedDriveClient(); } catch (_) { /* no Drive auth — skip */ }

      if (drive) {
        for (const fileId of fileIds) {
          const meta = metaMap[fileId] || {};
          const currentName = meta.fileName || '';

          if (alreadyPrefixedWithOrder(currentName, order.Order_Number)) {
            renameResults[fileId] = { status: 'skipped' };
            continue;
          }

          const newName = `${order.Order_Number} - ${currentName}`;
          try {
            await drive.files.update({
              fileId,
              supportsAllDrives: true,
              requestBody: { name: newName },
              fields: 'id,name',
            });
            await DesignFileLink.updateOne({ driveFileId: fileId }, { $set: { fileName: newName } });
            renameResults[fileId] = { status: 'renamed', newName };
          } catch (renameErr) {
            const msg = renameErr?.errors?.[0]?.message || renameErr?.message || 'Rename failed';
            logger.warn('design-files/link-order: Drive rename failed for %s — %s', fileId, msg);
            renameResults[fileId] = { status: 'failed', error: msg };
          }
        }
      }
    } catch (renameBlockErr) {
      logger.warn('design-files/link-order: rename block error — %s', renameBlockErr?.message);
    }

    return res.json({ success: true, linked: fileIds.length, orderNumber: order.Order_Number, renameResults });
  } catch (err) {
    logger.error({ err }, 'design-files/link-order error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/rename-file ──────────────────────────────────────
/**
 * Retry just the Drive rename for a single file (e.g. after closing it in CorelDraw).
 * Body: { fileId, fileName, orderNumber }
 */
router.post('/rename-file', async (req, res) => {
  try {
    const { fileId, fileName, orderNumber } = req.body || {};
    if (!fileId) return res.status(400).json({ success: false, message: 'fileId required' });
    if (!fileName) return res.status(400).json({ success: false, message: 'fileName required' });
    if (orderNumber == null) return res.status(400).json({ success: false, message: 'orderNumber required' });

    if (alreadyPrefixedWithOrder(fileName, orderNumber)) {
      return res.json({ success: true, status: 'skipped', message: `Filename already starts with Order #${orderNumber}` });
    }

    const newName = `${orderNumber} - ${fileName}`;

    let drive;
    try {
      drive = await getAuthorizedDriveClient();
    } catch (authErr) {
      if (authErr?.reconnectRequired) {
        return res.status(401).json({ success: false, message: 'Google Drive disconnected. Please reconnect.', reconnectRequired: true });
      }
      throw authErr;
    }

    try {
      await drive.files.update({
        fileId,
        supportsAllDrives: true,
        requestBody: { name: newName },
        fields: 'id,name',
      });
    } catch (renameErr) {
      const msg = renameErr?.errors?.[0]?.message || renameErr.message || 'Rename failed';
      logger.warn({ fileId, err: renameErr }, 'design-files/rename-file: Drive rename failed');
      return res.json({
        success: false,
        status: 'failed',
        message: `File linked to Order #${orderNumber} but rename failed — please close the file in CorelDraw and try again, or rename manually`,
        driveError: msg,
      });
    }

    // Update stored fileName
    await DesignFileLink.updateOne({ driveFileId: fileId }, { $set: { fileName: newName } });

    return res.json({ success: true, status: 'renamed', newName });
  } catch (err) {
    logger.error({ err }, 'design-files/rename-file error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/auto-temp-orders ─────────────────────────────────
/**
 * For each unmatched file passed in, creates a temporary placeholder order and
 * a DesignFileLink record so the file is tracked in MIS immediately.
 * The user can open the temp order later and fill in the real customer/amount.
 *
 * Body: { files: [{ fileId, fileName, stageNumber, stageLabel, stageColor }] }
 */
router.post('/auto-temp-orders', async (req, res) => {
  try {
    const { files = [] } = req.body || {};
    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ success: false, message: 'files array is required' });
    }

    // Skip files that already have a DesignFileLink record
    const fileIds = files.map((f) => f.fileId).filter(Boolean);
    const existingLinks = await DesignFileLink.find(
      { driveFileId: { $in: fileIds } },
      { driveFileId: 1 }
    ).lean();
    const alreadyLinked = new Set(existingLinks.map((l) => l.driveFileId));
    const toProcess = files.filter((f) => f.fileId && !alreadyLinked.has(f.fileId));

    if (!toProcess.length) {
      return res.json({ success: true, created: 0, message: 'All files already linked' });
    }

    const tempCustomer = await getOrCreateTempCustomer();
    const results = [];

    for (const file of toProcess) {
      const orderNum = await nextOrderNumber();
      const orderUuid = uuidv4();

      const order = new Orders({
        Order_uuid: orderUuid,
        Order_Number: orderNum,
        Customer_uuid: tempCustomer.Customer_uuid,
        orderNote: `[TEMP] ${file.fileName || file.fileId}`,
        orderMode: 'note',
        stage: 'design',
        stageHistory: [{ stage: 'design', timestamp: new Date() }],
        priority: 'medium',
        isTemporary: true,
        driveFile: { status: 'skipped' },
      });
      await order.save();

      await DesignFileLink.updateOne(
        { driveFileId: file.fileId },
        {
          $set: {
            orderUuid,
            orderNumber: orderNum,
            fileName: file.fileName || null,
            stageNumber: file.stageNumber || null,
            stageLabel: file.stageLabel || null,
            linkedAt: new Date(),
          },
        },
        { upsert: true }
      );

      results.push({ fileId: file.fileId, orderNumber: orderNum, orderUuid });
    }

    // Drive rename — isolated so it can never cause a 500 on the order creation
    const renameResults = {};
    try {
      let drive = null;
      try { drive = await getAuthorizedDriveClient(); } catch (_) { /* no Drive auth — skip */ }

      if (drive) {
        for (const result of results) {
          const fileMeta = toProcess.find((f) => f.fileId === result.fileId);
          const currentName = fileMeta?.fileName || '';

          if (alreadyPrefixedWithOrder(currentName, result.orderNumber)) {
            renameResults[result.fileId] = { status: 'skipped' };
            continue;
          }

          const newName = `${result.orderNumber} - ${currentName}`;
          try {
            await drive.files.update({
              fileId: result.fileId,
              supportsAllDrives: true,
              requestBody: { name: newName },
              fields: 'id,name',
            });
            await DesignFileLink.updateOne({ driveFileId: result.fileId }, { $set: { fileName: newName } });
            renameResults[result.fileId] = { status: 'renamed', newName };
          } catch (renameErr) {
            const msg = renameErr?.errors?.[0]?.message || renameErr?.message || 'Rename failed';
            logger.warn('design-files/auto-temp-orders: Drive rename failed for %s — %s', result.fileId, msg);
            renameResults[result.fileId] = { status: 'failed', error: msg };
          }
        }
      }
    } catch (renameBlockErr) {
      logger.warn('design-files/auto-temp-orders: rename block error — %s', renameBlockErr?.message);
    }

    return res.json({ success: true, created: results.length, orders: results, renameResults });
  } catch (err) {
    logger.error({ err }, 'design-files/auto-temp-orders error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/auto-scan-link ───────────────────────────────────
/**
 * Creates a draft DesignFileLink for any file in stages 1-7 that has no existing
 * link yet. Called automatically from the frontend after every scan.
 *
 * Body: { files: [{ fileId, fileName, stageNumber, stageLabel }] }
 */
router.post('/auto-scan-link', async (req, res) => {
  try {
    const { files = [] } = req.body || {};
    if (!Array.isArray(files) || !files.length) {
      return res.json({ success: true, created: 0 });
    }

    // Only process stages 1–7
    const eligible = files.filter((f) => f.fileId && f.stageNumber >= 1 && f.stageNumber <= 7);
    if (!eligible.length) {
      return res.json({ success: true, created: 0 });
    }

    // Filter out fileIds that already have a DesignFileLink
    const fileIds = eligible.map((f) => f.fileId);
    const existingLinks = await DesignFileLink.find(
      { driveFileId: { $in: fileIds } },
      { driveFileId: 1 }
    ).lean();
    const alreadyLinked = new Set(existingLinks.map((l) => l.driveFileId));
    const toCreate = eligible.filter((f) => !alreadyLinked.has(f.fileId));

    if (!toCreate.length) {
      return res.json({ success: true, created: 0 });
    }

    const ops = toCreate.map((f) => ({
      updateOne: {
        filter: { driveFileId: f.fileId },
        update: {
          $set: {
            linkStatus: 'draft',
            orderUuid: null,
            orderNumber: null,
            fileName: f.fileName || null,
            stageNumber: f.stageNumber || null,
            stageLabel: f.stageLabel || null,
            linkedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    await DesignFileLink.bulkWrite(ops);

    return res.json({ success: true, created: toCreate.length });
  } catch (err) {
    logger.error({ err }, 'design-files/auto-scan-link error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/confirm-final ────────────────────────────────────
/**
 * Confirms a Final (stage 8) file as a real MIS order.
 * Creates the order and renames the Drive file.
 *
 * Body: { fileId, fileName, customerUuid, itemDetails, mobileNumber }
 */
router.post('/confirm-final', async (req, res) => {
  try {
    const { fileId, fileName, customerUuid, itemDetails, mobileNumber } = req.body || {};

    if (!fileId) return res.status(400).json({ success: false, message: 'fileId required' });
    if (!fileName) return res.status(400).json({ success: false, message: 'fileName required' });
    if (!customerUuid) return res.status(400).json({ success: false, message: 'customerUuid required' });
    if (!itemDetails) return res.status(400).json({ success: false, message: 'itemDetails required' });

    const customer = await Customers.findOne({ Customer_uuid: customerUuid }).lean();
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const orderNum = await nextOrderNumber();
    const orderUuid = uuidv4();

    const order = new Orders({
      Order_uuid: orderUuid,
      Order_Number: orderNum,
      Customer_uuid: customerUuid,
      orderNote: itemDetails,
      orderMode: 'note',
      stage: 'design',
      priority: 'medium',
      stageHistory: [{ stage: 'design', timestamp: new Date() }],
      driveFile: { status: 'skipped' },
    });
    await order.save();

    // Build new filename
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx !== -1 ? fileName.slice(dotIdx + 1) : '';
    const mobile = mobileNumber || customer.Mobile_number || '';
    const newName = [
      orderNum,
      '-',
      sanitize(customer.Customer_name),
      '-',
      sanitize(itemDetails),
      '-',
      sanitize(mobile),
    ].join(' ').replace(/\s+-\s+-\s+/g, ' - ') + (ext ? `.${ext}` : '');

    // Upsert DesignFileLink
    await DesignFileLink.updateOne(
      { driveFileId: fileId },
      {
        $set: {
          linkStatus: 'confirmed',
          orderUuid,
          orderNumber: orderNum,
          customerUuid,
          customerName: customer.Customer_name,
          fileName: newName,
          linkedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Drive rename — isolated, never fails the confirm
    let renamed = false;
    const renameResults = {};
    try {
      let drive = null;
      try { drive = await getAuthorizedDriveClient(); } catch (_) {}
      if (drive) {
        try {
          await drive.files.update({
            fileId,
            supportsAllDrives: true,
            requestBody: { name: newName },
            fields: 'id,name',
          });
          await DesignFileLink.updateOne({ driveFileId: fileId }, { $set: { fileName: newName } });
          renamed = true;
          renameResults[fileId] = { status: 'renamed', newName };
        } catch (renameErr) {
          logger.warn('design-files/confirm-final: Drive rename failed for %s — %s', fileId, renameErr?.message);
          await DesignFileLink.updateOne({ driveFileId: fileId }, { $set: { renameStatus: 'failed' } });
          renameResults[fileId] = { status: 'failed', error: renameErr?.message };
        }
      }
    } catch (renameBlockErr) {
      logger.warn('rename block error — %s', renameBlockErr?.message);
    }

    return res.json({ success: true, orderNumber: orderNum, orderUuid, newName, renamed });
  } catch (err) {
    logger.error({ err }, 'design-files/confirm-final error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/auto-print-job ───────────────────────────────────
/**
 * Auto-creates purchase orders for Printing (stage 9) files that don't have a
 * print job yet.
 *
 * Body: { files: [{ fileId, fileName, orderUuid, orderNumber, stageNumber }] }
 */
router.post('/auto-print-job', async (req, res) => {
  try {
    const { files = [] } = req.body || {};
    if (!Array.isArray(files) || !files.length) {
      return res.json({ success: true, created: 0, jobs: [] });
    }

    const fileIds = files.map((f) => f.fileId).filter(Boolean);

    // Filter out files that already have printJobId in DesignFileLink
    const existingLinks = await DesignFileLink.find(
      { driveFileId: { $in: fileIds }, printJobId: { $exists: true, $ne: null } },
      { driveFileId: 1 }
    ).lean();
    const alreadyHasJob = new Set(existingLinks.map((l) => l.driveFileId));
    const toProcess = files.filter((f) => f.fileId && !alreadyHasJob.has(f.fileId));

    if (!toProcess.length) {
      return res.json({ success: true, created: 0, jobs: [] });
    }

    const suspenseVendor = await getOrCreateSuspenseVendor();
    const results = [];

    for (const file of toProcess) {
      const jobNum = await nextPrintJobNumber();
      const workUuid = uuidv4();
      const fileOrderUuid = file.orderUuid || null;
      const fileOrderNumber = file.orderNumber || null;

      await VendorWork.create({
        work_uuid: workUuid,
        Vendor_uuid: suspenseVendor.Vendor_uuid,
        Vendor_name: suspenseVendor.Vendor_name,
        Order_uuid: fileOrderUuid,
        Order_Number: fileOrderNumber,
        Process: 'printing',
        Amount: 1,
        Status: 'draft',
        Notes: file.fileName || file.fileId,
      });

      await VendorLedger.create({
        vendor_uuid: suspenseVendor.Vendor_uuid,
        vendor_name: suspenseVendor.Vendor_name,
        entry_type: 'job_bill',
        dr_cr: 'cr',
        amount: 1,
        job_uuid: workUuid,
        narration: `Print job PJ-${jobNum} — ${file.fileName || file.fileId}`,
      });

      await DesignFileLink.updateOne(
        { driveFileId: file.fileId },
        {
          $set: {
            linkStatus: 'printing',
            printJobId: workUuid,
            printJobNumber: jobNum,
          },
        },
        { upsert: true }
      );

      results.push({ fileId: file.fileId, printJobNumber: jobNum, workUuid });
    }

    return res.json({ success: true, created: results.length, jobs: results });
  } catch (err) {
    logger.error({ err }, 'design-files/auto-print-job error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/update-print-job ─────────────────────────────────
/**
 * Updates an existing print job with real vendor and amount.
 *
 * Body: { printJobId, vendorUuid, amount, notes }
 */
router.post('/update-print-job', async (req, res) => {
  try {
    const { printJobId, vendorUuid, amount, notes } = req.body || {};

    if (!printJobId) return res.status(400).json({ success: false, message: 'printJobId required' });
    if (!vendorUuid) return res.status(400).json({ success: false, message: 'vendorUuid required' });
    if (amount == null) return res.status(400).json({ success: false, message: 'amount required' });

    const vendor = await VendorMaster.findOne({ Vendor_uuid: vendorUuid }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const resolvedAmount = Number(amount);

    await VendorWork.updateOne(
      { work_uuid: printJobId },
      {
        $set: {
          Vendor_uuid: vendor.Vendor_uuid,
          Vendor_name: vendor.Vendor_name,
          Amount: resolvedAmount,
          Notes: notes || undefined,
          Status: 'draft',
        },
      }
    );

    await VendorLedger.updateOne(
      { job_uuid: printJobId },
      {
        $set: {
          vendor_uuid: vendor.Vendor_uuid,
          vendor_name: vendor.Vendor_name,
          amount: resolvedAmount,
        },
      },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'design-files/update-print-job error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/rename-print-file ────────────────────────────────
/**
 * Renames a Printing file to "{orderNumber} - {vendorName} - PJ{jobNumber:03d} - {originalName}".
 *
 * Body: { fileId, orderNumber, vendorName, printJobNumber, originalFileName }
 */
router.post('/rename-print-file', async (req, res) => {
  try {
    const { fileId, orderNumber, vendorName, printJobNumber, originalFileName } = req.body || {};

    if (!fileId) return res.status(400).json({ success: false, message: 'fileId required' });
    if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber required' });
    if (!vendorName) return res.status(400).json({ success: false, message: 'vendorName required' });
    if (printJobNumber == null) return res.status(400).json({ success: false, message: 'printJobNumber required' });
    if (!originalFileName) return res.status(400).json({ success: false, message: 'originalFileName required' });

    const newName = `${orderNumber} - ${sanitize(vendorName)} - PJ${String(printJobNumber).padStart(3, '0')} - ${sanitize(originalFileName)}`;

    let renamed = false;
    let status = 'failed';
    let message = 'Drive rename not attempted';

    const renameResults = {};
    try {
      let drive = null;
      try { drive = await getAuthorizedDriveClient(); } catch (_) {}
      if (drive) {
        try {
          await drive.files.update({
            fileId,
            supportsAllDrives: true,
            requestBody: { name: newName },
            fields: 'id,name',
          });
          await DesignFileLink.updateOne({ driveFileId: fileId }, { $set: { fileName: newName } });
          renamed = true;
          status = 'renamed';
          message = 'File renamed successfully';
          renameResults[fileId] = { status: 'renamed', newName };
        } catch (renameErr) {
          logger.warn('design-files/rename-print-file: Drive rename failed for %s — %s', fileId, renameErr?.message);
          status = 'failed';
          message = renameErr?.message || 'Rename failed';
          renameResults[fileId] = { status: 'failed', error: renameErr?.message };
        }
      }
    } catch (renameBlockErr) {
      logger.warn('rename block error — %s', renameBlockErr?.message);
    }

    return res.json({ success: renamed, newName, status, message });
  } catch (err) {
    logger.error({ err }, 'design-files/rename-print-file error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/design-files/scan-archive ──────────────────────────────────────
/**
 * Scans the month-wise archive folder with 3-level traversal:
 *   Archive Root → Month Folder → Date Subfolders → Final/Printing Subfolders → Files
 *
 * Returns data grouped by date for the frontend to render as collapsible date groups.
 */

/** Identify section type from archive subfolder name (Final / Printing) */
function archiveSectionStage(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('final')) return 8;
  if (lower.includes('print')) return 9;
  return null;
}

router.get('/scan-archive', async (_req, res) => {
  try {
    const archiveFolderId = process.env.DRIVE_ARCHIVE_FOLDER_ID;
    if (!archiveFolderId) {
      return res.status(400).json({ success: false, message: 'DRIVE_ARCHIVE_FOLDER_ID not configured' });
    }

    const drive = await getAuthorizedDriveClient();

    // 1. Find the current-month subfolder inside the archive root
    const monthSubfolders = await listChildren(drive, archiveFolderId, 'application/vnd.google-apps.folder');

    let monthFolder = null;
    if (monthSubfolders.length) {
      const now = new Date();
      const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthName = monthNames[now.getMonth()];
      const year = String(now.getFullYear());

      monthFolder = monthSubfolders.find((f) => {
        const n = f.name.toLowerCase().replace(/[/_]/g, '-');
        return n.includes(yyyymm) || (n.includes(monthName) && n.includes(year));
      });

      if (!monthFolder) {
        monthFolder = [...monthSubfolders].sort(
          (a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)
        )[0];
      }
    }

    if (!monthFolder) {
      return res.json({
        success: true, monthFolderName: null,
        dates: [], summary: { total: 0, unmatched: 0 },
      });
    }

    // 2. List date subfolders inside the month folder
    const dateFolders = await listChildren(drive, monthFolder.id, 'application/vnd.google-apps.folder');

    // Sort date folders by name descending (newest date first)
    dateFolders.sort((a, b) => b.name.localeCompare(a.name));

    // 3. For each date folder, scan Final/Printing subfolders
    const allFilesFlat = [];
    const dateGroups = await Promise.all(
      dateFolders.map(async (dateFolder) => {
        const sectionFolders = await listChildren(drive, dateFolder.id, 'application/vnd.google-apps.folder');

        const sections = await Promise.all(
          sectionFolders.map(async (sectionFolder) => {
            const sectionStageNum = archiveSectionStage(sectionFolder.name);
            const files = await listChildren(drive, sectionFolder.id);
            const mapped = files.map((file) => ({
              fileId: file.id,
              fileName: file.name,
              modifiedTime: file.modifiedTime,
              size: file.size || null,
              dateFolderName: dateFolder.name,
              sectionFolderName: sectionFolder.name,
              stageNumber: sectionStageNum,
              stageLabel: sectionStageNum ? stageLabel(sectionStageNum) : sectionFolder.name,
              stageColor: sectionStageNum ? stageColor(sectionStageNum) : null,
              extractedOrderNumber: extractOrderNumber(file.name),
            }));
            allFilesFlat.push(...mapped);
            return {
              sectionName: sectionFolder.name,
              stageNumber: sectionStageNum,
              stageLabel: sectionStageNum ? stageLabel(sectionStageNum) : sectionFolder.name,
              stageColor: sectionStageNum ? stageColor(sectionStageNum) : null,
              files: mapped,
            };
          })
        );

        // Also handle flat files directly in the date folder (no section subfolder)
        const flatFiles = (await listChildren(drive, dateFolder.id)).filter(
          (f) => f.mimeType !== 'application/vnd.google-apps.folder'
        );
        const flatMapped = flatFiles.map((file) => ({
          fileId: file.id,
          fileName: file.name,
          modifiedTime: file.modifiedTime,
          size: file.size || null,
          dateFolderName: dateFolder.name,
          sectionFolderName: null,
          stageNumber: null,
          stageLabel: null,
          stageColor: null,
          extractedOrderNumber: extractOrderNumber(file.name),
        }));
        if (flatMapped.length) {
          allFilesFlat.push(...flatMapped);
          sections.push({
            sectionName: 'Other',
            stageNumber: null,
            stageLabel: null,
            stageColor: null,
            files: flatMapped,
          });
        }

        return {
          dateName: dateFolder.name,
          dateFolderId: dateFolder.id,
          sections: sections.filter((s) => s.files.length > 0),
          fileCount: sections.reduce((s, sec) => s + sec.files.length, 0) + flatMapped.length,
        };
      })
    );

    const activeDates = dateGroups.filter((d) => d.fileCount > 0);

    // 4. Batch-match by order number across all files
    const orderNumbers = [...new Set(allFilesFlat.map((f) => f.extractedOrderNumber).filter(Boolean))];
    const orders = orderNumbers.length
      ? await Orders.find(
          { Order_Number: { $in: orderNumbers } },
          { Order_uuid: 1, Order_Number: 1, stage: 1, Amount: 1, isTemporary: 1 }
        ).lean()
      : [];
    const orderByNumber = {};
    orders.forEach((o) => { orderByNumber[o.Order_Number] = o; });

    function enrichFile(file) {
      const order = file.extractedOrderNumber ? orderByNumber[file.extractedOrderNumber] || null : null;
      return {
        ...file,
        matched: !!order,
        orderUuid: order?.Order_uuid || null,
        orderNumber: order?.Order_Number || file.extractedOrderNumber || null,
        orderStage: order?.stage || null,
        orderAmount: order?.Amount || null,
        isTemporaryOrder: order?.isTemporary || false,
      };
    }

    // 5. Apply enrichment to the nested structure
    const enrichedDates = activeDates.map((dateGroup) => ({
      ...dateGroup,
      sections: dateGroup.sections.map((section) => ({
        ...section,
        files: section.files.map(enrichFile),
      })),
    }));

    // Also apply DesignFileLink matches for archive files
    const allEnrichedFlat = enrichedDates.flatMap((d) => d.sections.flatMap((s) => s.files));
    const linkedEnrichedFlat = await applyLinks(allEnrichedFlat);
    const linkedById = {};
    linkedEnrichedFlat.forEach((f) => { linkedById[f.fileId] = f; });

    const finalDates = enrichedDates.map((dateGroup) => ({
      ...dateGroup,
      sections: dateGroup.sections.map((section) => ({
        ...section,
        files: section.files.map((f) => linkedById[f.fileId] || f),
      })),
    }));

    const summary = {
      total: linkedEnrichedFlat.length,
      matched: linkedEnrichedFlat.filter((f) => f.matched).length,
      unmatched: linkedEnrichedFlat.filter((f) => !f.matched).length,
    };

    return res.json({
      success: true,
      monthFolderName: monthFolder.name,
      dates: finalDates,
      summary,
    });
  } catch (err) {
    logger.error({ err }, 'design-files/scan-archive error');
    if (err?.reconnectRequired) {
      return res.status(401).json({ success: false, message: 'Google Drive disconnected. Please reconnect.', reconnectRequired: true });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/create-print-job ─────────────────────────────────
router.post('/create-print-job', async (req, res) => {
  try {
    const { orderUuid, vendorUuid, vendorName, items = [], totalAmount, notes } = req.body || {};

    if (!orderUuid) return res.status(400).json({ success: false, message: 'orderUuid required' });
    if (!vendorUuid) return res.status(400).json({ success: false, message: 'vendorUuid required' });
    if (!items.length) return res.status(400).json({ success: false, message: 'items required' });

    const [order, vendor] = await Promise.all([
      Orders.findOne({ Order_uuid: orderUuid }, { Order_uuid: 1, Order_Number: 1 }).lean(),
      VendorMaster.findOne({ Vendor_uuid: vendorUuid }, { Vendor_uuid: 1, Vendor_name: 1 }).lean(),
    ]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const resolvedVendorName = vendor.Vendor_name || vendorName || '';
    const resolvedTotal = Number(totalAmount) || items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const workUuid = uuidv4();

    const work = await VendorWork.create({
      work_uuid: workUuid,
      Vendor_uuid: vendor.Vendor_uuid,
      Vendor_name: resolvedVendorName,
      Order_uuid: order.Order_uuid,
      Order_Number: order.Order_Number,
      Process: 'printing',
      Amount: resolvedTotal,
      Status: 'draft',
      Notes: notes || JSON.stringify(items.map((i) => ({
        file: i.fileName, qty: i.qty, rate: i.rate, amount: i.amount,
      }))),
    });

    const ledger = await VendorLedger.create({
      vendor_uuid: vendor.Vendor_uuid,
      vendor_name: resolvedVendorName,
      entry_type: 'job_bill',
      dr_cr: 'cr',
      amount: resolvedTotal,
      job_uuid: workUuid,
      order_uuid: order.Order_uuid,
      order_number: order.Order_Number,
      narration: `Print job - ${items.length} file${items.length !== 1 ? 's' : ''} for order #${order.Order_Number}`,
      reference_type: 'print_job',
      reference_id: workUuid,
    });

    return res.json({
      success: true,
      workId: work._id,
      ledgerEntryId: ledger._id,
      totalAmount: resolvedTotal,
      orderNumber: order.Order_Number,
    });
  } catch (err) {
    logger.error({ err }, 'design-files/create-print-job error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
