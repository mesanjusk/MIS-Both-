const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { getAuthorizedDriveClient } = require('../services/googleDriveOAuthService');
const { listSubfolders, parseFolderDate } = require('../services/driveArchiveFolderService');
const { normalizeName, parsePrintingFolderName, namesMatch } = require('../services/workflowReconciliationService');
const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const PurchaseOrder = require('../repositories/purchaseOrder');
const ProductionJob = require('../repositories/productionJob');
const DesignFileLink = require('../repositories/DesignFileLink');
const logger = require('../utils/logger');

router.use(requireAuth);
router.use(requirePermission('canViewAccounts'));

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CACHE_MS = 2 * 60 * 1000;
let cache = { expiresAt: 0, payload: null };

function extractOrderNumber(name = '') {
  const match = String(name || '').trim().match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function dateKeyFromName(name = '') {
  const parsed = parseFolderDate(name);
  if (!parsed) return '';
  return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function finalCustomerName(fileName = '', orderNumber = null) {
  const raw = String(fileName || '').trim();
  if (!orderNumber) return '';
  const withoutNumber = raw.replace(new RegExp(`^${orderNumber}\\s*[-_]\\s*`), '');
  const parts = withoutNumber.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  return parts[0] || '';
}

async function listChildren(drive, folderId, mimeType = null) {
  const rows = [];
  let pageToken;
  do {
    const q = [
      `'${folderId}' in parents`,
      'trashed = false',
      mimeType ? `mimeType = '${mimeType}'` : null,
    ].filter(Boolean).join(' and ');

    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id,name,mimeType,createdTime,modifiedTime)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    rows.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return rows;
}

async function scanArchiveStructure(drive, archiveFolderId) {
  const months = await listSubfolders(drive, archiveFolderId);
  const rows = [];

  for (const month of months) {
    const dateFolders = await listSubfolders(drive, month.id);
    for (const dateFolder of dateFolders) {
      const date = dateKeyFromName(dateFolder.name);
      if (!date) continue;

      const sections = await listSubfolders(drive, dateFolder.id);
      const finalFolder = sections.find((folder) => /final/i.test(folder.name));
      const printingFolder = sections.find((folder) => /print/i.test(folder.name));

      const [finalFiles, printingFolders] = await Promise.all([
        finalFolder ? listChildren(drive, finalFolder.id).then((items) => items.filter((item) => item.mimeType !== FOLDER_MIME)) : [],
        printingFolder ? listChildren(drive, printingFolder.id, FOLDER_MIME) : [],
      ]);

      const finalByOrder = new Map();
      finalFiles.forEach((file) => {
        const orderNumber = extractOrderNumber(file.name);
        if (!orderNumber) return;
        if (!finalByOrder.has(orderNumber)) finalByOrder.set(orderNumber, []);
        finalByOrder.get(orderNumber).push(file);
      });

      const printingByOrder = new Map();
      printingFolders.forEach((folder) => {
        const parsed = parsePrintingFolderName(folder.name);
        if (!parsed.orderNumber) return;
        if (!printingByOrder.has(parsed.orderNumber)) printingByOrder.set(parsed.orderNumber, []);
        printingByOrder.get(parsed.orderNumber).push({ ...folder, parsed });
      });

      const orderNumbers = new Set([...finalByOrder.keys(), ...printingByOrder.keys()]);
      orderNumbers.forEach((orderNumber) => {
        rows.push({
          date,
          monthName: month.name,
          dateFolderName: dateFolder.name,
          finalFolderId: finalFolder?.id || '',
          printingFolderId: printingFolder?.id || '',
          orderNumber,
          finalFiles: finalByOrder.get(orderNumber) || [],
          printingFolders: printingByOrder.get(orderNumber) || [],
        });
      });
    }
  }

  return rows;
}

function buildIssue(code, message, severity = 'error') {
  return { code, message, severity };
}

async function buildAuditPayload({ refresh = false } = {}) {
  if (!refresh && cache.payload && cache.expiresAt > Date.now()) return cache.payload;

  const archiveFolderId = String(process.env.DRIVE_ARCHIVE_FOLDER_ID || '').trim();
  if (!archiveFolderId) {
    const err = new Error('DRIVE_ARCHIVE_FOLDER_ID not configured');
    err.statusCode = 400;
    throw err;
  }

  const drive = await getAuthorizedDriveClient();
  const archiveRows = await scanArchiveStructure(drive, archiveFolderId);

  const orderNumbers = [...new Set(archiveRows.map((row) => row.orderNumber).filter(Boolean))];
  const orders = orderNumbers.length
    ? await Orders.find(
        { Order_Number: { $in: orderNumbers } },
        { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, stage: 1, isTemporary: 1 }
      ).lean()
    : [];

  const orderByNumber = new Map(orders.map((order) => [Number(order.Order_Number), order]));
  const orderUuids = orders.map((order) => order.Order_uuid).filter(Boolean);

  const customerUuids = [...new Set(orders.map((order) => order.Customer_uuid).filter(Boolean))];
  const customers = customerUuids.length
    ? await Customers.find(
        { Customer_uuid: { $in: customerUuids } },
        { Customer_uuid: 1, Customer_name: 1 }
      ).lean()
    : [];
  const customerByUuid = new Map(customers.map((customer) => [customer.Customer_uuid, customer]));

  const folderIds = archiveRows.flatMap((row) => row.printingFolders.map((folder) => folder.id)).filter(Boolean);

  const [purchaseOrders, postPressJobs, designLinks] = await Promise.all([
    orderUuids.length || folderIds.length
      ? PurchaseOrder.find({
          $or: [
            ...(orderUuids.length ? [{ Order_uuid: { $in: orderUuids } }] : []),
            ...(folderIds.length ? [{ sourceDriveFolderId: { $in: folderIds } }] : []),
          ],
          status: { $ne: 'cancelled' },
        }).lean()
      : [],
    orderUuids.length
      ? ProductionJob.find({
          job_category: 'post_printing',
          status: { $ne: 'cancelled' },
          $or: [
            { order_uuid: { $in: orderUuids } },
            { 'linkedOrders.orderUuid': { $in: orderUuids } },
          ],
        }).lean()
      : [],
    orderUuids.length
      ? DesignFileLink.find(
          { orderUuid: { $in: orderUuids } },
          {
            driveFileId: 1,
            fileName: 1,
            orderUuid: 1,
            orderNumber: 1,
            customerName: 1,
            printFolderId: 1,
            linkStatus: 1,
            stageNumber: 1,
          }
        ).lean()
      : [],
  ]);

  const posByOrder = new Map();
  const posByFolder = new Map();
  purchaseOrders.forEach((po) => {
    if (po.Order_uuid) {
      if (!posByOrder.has(po.Order_uuid)) posByOrder.set(po.Order_uuid, []);
      posByOrder.get(po.Order_uuid).push(po);
    }
    if (po.sourceDriveFolderId) posByFolder.set(po.sourceDriveFolderId, po);
  });

  const jobsByOrder = new Map();
  postPressJobs.forEach((job) => {
    const ids = new Set();
    if (job.order_uuid) ids.add(job.order_uuid);
    (job.linkedOrders || []).forEach((link) => {
      if (link?.orderUuid) ids.add(link.orderUuid);
    });
    ids.forEach((id) => {
      if (!jobsByOrder.has(id)) jobsByOrder.set(id, []);
      jobsByOrder.get(id).push(job);
    });
  });

  const linksByOrder = new Map();
  designLinks.forEach((link) => {
    if (!link.orderUuid) return;
    if (!linksByOrder.has(link.orderUuid)) linksByOrder.set(link.orderUuid, []);
    linksByOrder.get(link.orderUuid).push(link);
  });

  const result = archiveRows.map((row) => {
    const issues = [];
    const order = orderByNumber.get(Number(row.orderNumber)) || null;
    const customer = order?.Customer_uuid ? customerByUuid.get(order.Customer_uuid) : null;
    const finalFiles = row.finalFiles || [];
    const printingFolders = row.printingFolders || [];
    const finalFile = finalFiles[0] || null;
    const printingFolder = printingFolders[0] || null;
    const parsedPrinting = printingFolder?.parsed || {};
    const orderLinks = order ? (linksByOrder.get(order.Order_uuid) || []) : [];
    const matchingLink = printingFolder
      ? orderLinks.find((link) => String(link.printFolderId || '') === String(printingFolder.id))
      : null;

    const finalExists = finalFiles.length > 0;
    const printingExists = printingFolders.length > 0;
    const duplicateFinal = finalFiles.length > 1;
    const duplicatePrinting = printingFolders.length > 1;

    if (duplicateFinal) issues.push(buildIssue('DUPLICATE_FINAL', `${finalFiles.length} Final files start with Order #${row.orderNumber}`, 'warning'));
    if (duplicatePrinting) issues.push(buildIssue('DUPLICATE_PRINTING', `${printingFolders.length} Printing folders start with Order #${row.orderNumber}`, 'error'));

    if (printingExists && !finalExists) {
      issues.push(buildIssue('PRINTING_WITHOUT_FINAL', 'Printing folder exists but matching Final file is missing.'));
    }

    if (finalExists && !printingExists && order) {
      issues.push(buildIssue(
        'ORDER_BEFORE_PRINTING',
        'MIS order exists while the job is still only in Final. Your rule says real dashboard order should begin when the job moves to Printing.',
        'warning'
      ));
    }

    if (printingExists && !order) {
      issues.push(buildIssue('PRINTING_WITHOUT_ORDER', 'Printing folder exists but no MIS customer order has this order number.'));
    }

    const finalCustomer = finalCustomerName(finalFile?.name || '', row.orderNumber);
    const customerName = customer?.Customer_name || '';
    if (order && finalCustomer && customerName && !namesMatch(finalCustomer, customerName)) {
      issues.push(buildIssue('FINAL_CUSTOMER_MISMATCH', `Final file customer "${finalCustomer}" does not match MIS customer "${customerName}".`));
    }

    if (order && printingFolder && parsedPrinting.customerName && customerName && !namesMatch(parsedPrinting.customerName, customerName)) {
      issues.push(buildIssue('PRINT_CUSTOMER_MISMATCH', `Printing folder customer "${parsedPrinting.customerName}" does not match MIS customer "${customerName}".`));
    }

    if (order && printingFolder && !matchingLink) {
      issues.push(buildIssue('PRINT_FOLDER_LINK_MISMATCH', 'Printing folder is not the folder stored against the confirmed Final/order link.'));
    }

    const purchaseOrderList = order ? (posByOrder.get(order.Order_uuid) || []) : [];
    const folderPo = printingFolder ? posByFolder.get(printingFolder.id) || null : null;

    if (printingExists && order && !folderPo) {
      issues.push(buildIssue('PO_NOT_LINKED_TO_PRINT_FOLDER', 'No vendor Purchase Order is linked to this exact Printing folder yet.', 'warning'));
    }

    if (folderPo && order && String(folderPo.Order_uuid || '') !== String(order.Order_uuid)) {
      issues.push(buildIssue('PO_ORDER_MISMATCH', 'Vendor PO points to a different MIS order.'));
    }

    if (folderPo && parsedPrinting.vendorName && folderPo.Vendor_name && !namesMatch(parsedPrinting.vendorName, folderPo.Vendor_name)) {
      issues.push(buildIssue('PO_VENDOR_MISMATCH', `Printing folder vendor "${parsedPrinting.vendorName}" does not match PO vendor "${folderPo.Vendor_name}".`));
    }

    const postPress = order ? (jobsByOrder.get(order.Order_uuid) || []) : [];
    postPress.forEach((job) => {
      const jobOrderNumbers = [
        job.order_number,
        ...(job.linkedOrders || []).map((link) => link?.orderNumber),
      ].filter((value) => value != null).map(Number);

      if (jobOrderNumbers.length && !jobOrderNumbers.includes(Number(row.orderNumber))) {
        issues.push(buildIssue('POST_PRESS_ORDER_MISMATCH', `Post Press job #${job.job_number || '?'} points to another order number.`));
      }

      if (job.driveFileId && printingFolder && String(job.driveFileId) !== String(printingFolder.id)) {
        issues.push(buildIssue('POST_PRESS_FOLDER_MISMATCH', `Post Press job #${job.job_number || '?'} is linked to a different Printing folder.`));
      }

      if (!job.driveFileId) {
        issues.push(buildIssue('POST_PRESS_FOLDER_UNLINKED', `Post Press job #${job.job_number || '?'} has no Printing-folder link.`, 'warning'));
      }
    });

    const twoWay = finalExists && printingExists && !duplicatePrinting;
    const threeWay = twoWay && Boolean(order);
    const nameMatch = Boolean(
      order
      && customerName
      && (!finalCustomer || namesMatch(finalCustomer, customerName))
      && (!parsedPrinting.customerName || namesMatch(parsedPrinting.customerName, customerName))
    );
    const poMatch = Boolean(folderPo && order && String(folderPo.Order_uuid || '') === String(order.Order_uuid));
    const postPressMatch = postPress.every((job) => {
      const nums = [
        job.order_number,
        ...(job.linkedOrders || []).map((link) => link?.orderNumber),
      ].filter((value) => value != null).map(Number);
      const numberOk = !nums.length || nums.includes(Number(row.orderNumber));
      const folderOk = !job.driveFileId || !printingFolder || String(job.driveFileId) === String(printingFolder.id);
      return numberOk && folderOk;
    });

    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.filter((issue) => issue.severity === 'warning').length;
    const status = errors ? 'fail' : warnings ? 'warning' : (threeWay && nameMatch ? 'pass' : 'pending');

    return {
      date: row.date,
      monthName: row.monthName,
      dateFolderName: row.dateFolderName,
      orderNumber: row.orderNumber,
      orderUuid: order?.Order_uuid || '',
      orderStage: order?.stage || '',
      customerName,
      final: {
        exists: finalExists,
        count: finalFiles.length,
        fileId: finalFile?.id || '',
        fileName: finalFile?.name || '',
        customerName: finalCustomer,
      },
      printing: {
        exists: printingExists,
        count: printingFolders.length,
        folderId: printingFolder?.id || '',
        folderName: printingFolder?.name || '',
        vendorName: parsedPrinting.vendorName || '',
        customerName: parsedPrinting.customerName || '',
      },
      purchaseOrder: folderPo
        ? {
            exists: true,
            poUuid: folderPo.PO_uuid,
            poNumber: folderPo.PO_Number,
            vendorUuid: folderPo.Vendor_uuid,
            vendorName: folderPo.Vendor_name,
            sourceDriveFolderId: folderPo.sourceDriveFolderId || '',
          }
        : { exists: false, alternatives: purchaseOrderList.length },
      postPress: {
        count: postPress.length,
        completed: postPress.filter((job) => job.status === 'completed').length,
        jobs: postPress.map((job) => ({
          jobUuid: job.job_uuid,
          jobNumber: job.job_number,
          jobType: job.job_type,
          vendorName: job.vendor_name,
          orderNumber: job.order_number,
          driveFileId: job.driveFileId || '',
          status: job.status,
        })),
      },
      matches: {
        twoWay,
        threeWay,
        names: nameMatch,
        po: poMatch,
        postPress: postPressMatch,
      },
      status,
      issues,
      counts: { errors, warnings },
    };
  });

  result.sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.orderNumber) - Number(a.orderNumber));

  const dateCounts = {};
  result.forEach((row) => {
    if (!row.date) return;
    dateCounts[row.date] = (dateCounts[row.date] || 0) + 1;
  });

  const summary = {
    total: result.length,
    pass: result.filter((row) => row.status === 'pass').length,
    warning: result.filter((row) => row.status === 'warning').length,
    fail: result.filter((row) => row.status === 'fail').length,
    pending: result.filter((row) => row.status === 'pending').length,
    twoWayMatched: result.filter((row) => row.matches.twoWay).length,
    threeWayMatched: result.filter((row) => row.matches.threeWay).length,
    poMatched: result.filter((row) => row.matches.po).length,
    postPressMatched: result.filter((row) => row.matches.postPress).length,
  };

  const payload = {
    rows: result,
    summary,
    dates: Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    generatedAt: new Date().toISOString(),
  };

  cache = { payload, expiresAt: Date.now() + CACHE_MS };
  return payload;
}

router.get('/', async (req, res) => {
  try {
    const refresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const date = String(req.query.date || '').trim();
    const payload = await buildAuditPayload({ refresh });
    const rows = date ? payload.rows.filter((row) => row.date === date) : payload.rows;

    return res.json({
      success: true,
      result: rows,
      summary: payload.summary,
      dates: payload.dates,
      generatedAt: payload.generatedAt,
    });
  } catch (error) {
    logger.error({ err: error }, 'workflow-audit failed');
    if (error?.reconnectRequired) {
      return res.status(401).json({
        success: false,
        message: 'Google Drive disconnected. Please reconnect.',
        reconnectRequired: true,
      });
    }
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Workflow audit failed',
    });
  }
});

module.exports = router;
