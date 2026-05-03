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

/** List immediate children of a Drive folder */
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
  return res.data.files || [];
}

// ─── GET /api/design-files/config-check ──────────────────────────────────────
router.get('/config-check', (_req, res) => {
  return res.json({ configured: !!process.env.DRIVE_DAILY_FOLDER_ID });
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

    // 2. List files in all subfolders in parallel
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

    // 3. Batch-fetch all matching orders from MIS
    const orderNumbers = [...new Set(allFiles.map((f) => f.extractedOrderNumber).filter(Boolean))];
    const orders = orderNumbers.length
      ? await Orders.find(
          { Order_Number: { $in: orderNumbers } },
          { Order_uuid: 1, Order_Number: 1, stage: 1, Amount: 1, orderNote: 1 }
        ).lean()
      : [];
    const orderByNumber = {};
    orders.forEach((o) => { orderByNumber[o.Order_Number] = o; });

    // 4. Enrich files with matched order data
    const enriched = allFiles.map((file) => {
      const order = file.extractedOrderNumber ? orderByNumber[file.extractedOrderNumber] || null : null;
      return {
        ...file,
        matched: !!order,
        orderUuid: order?.Order_uuid || null,
        orderNumber: order?.Order_Number || file.extractedOrderNumber || null,
        orderStage: order?.stage || null,
        orderAmount: order?.Amount || null,
      };
    });

    // 5. Build summary
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

    return res.json({ success: true, files: enriched, summary });
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

    const unmatched = allFiles.filter(
      (f) => !f.extractedOrderNumber || !foundSet.has(f.extractedOrderNumber)
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
      Order_uuid: 1, Order_Number: 1, orderNote: 1, stage: 1,
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
    return res.json({ success: true, linked: fileIds.length, orderNumber: order.Order_Number });
  } catch (err) {
    logger.error({ err }, 'design-files/link-order error');
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
