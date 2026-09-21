const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const DesignFileLink = require('../repositories/DesignFileLink');
const { ACCOUNT_PAYABLE_GROUP } = require('../constants/assignees');
const { getAuthorizedDriveClient } = require('./googleDriveOAuthService');
const { buildOrderFolderName } = require('./driveArchiveFolderService');
const { assignOrderToUser } = require('./orderTaskService');

function normalizeName(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLeadingOrderNumber(name = '') {
  const match = String(name || '').trim().match(/^(\d+)(?:\s|[-_])/);
  return match ? Number(match[1]) : null;
}

function includesName(fullName, expected) {
  const full = normalizeName(fullName);
  const want = normalizeName(expected);
  return Boolean(full && want && full.includes(want));
}

function workflowError(message, code, statusCode = 422) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

async function isInsideFinalFolder(drive, fileId) {
  const file = await drive.files.get({
    fileId,
    fields: 'id,name,parents,trashed',
    supportsAllDrives: true,
  });
  if (file.data.trashed) {
    return { ok: false, fileName: file.data.name || '', finalFolderName: '' };
  }

  let parentId = file.data.parents?.[0] || null;
  let finalFolderName = '';
  for (let depth = 0; parentId && depth < 8; depth += 1) {
    const folder = await drive.files.get({
      fileId: parentId,
      fields: 'id,name,parents,trashed',
      supportsAllDrives: true,
    });
    const name = String(folder.data.name || '');
    if (name.toLowerCase().includes('final')) {
      finalFolderName = name;
      return {
        ok: true,
        fileName: file.data.name || '',
        finalFolderId: folder.data.id,
        finalFolderName,
      };
    }
    parentId = folder.data.parents?.[0] || null;
  }

  return { ok: false, fileName: file.data.name || '', finalFolderName };
}

/**
 * Strict identity check used before any financial/post-press action.
 * It verifies the same job exists as:
 *   Final design file -> MIS order/customer -> Printing folder.
 *
 * Vendor identity is intentionally optional here because post-press may use
 * a different vendor. Printing invoice creation passes vendorUuid and asks
 * this service to canonicalise the Printing folder/assignment as well.
 */
async function verifyPrintingWorkflowIdentity({
  orderNumber,
  orderUuid,
  folderId,
  vendorUuid = '',
  canonicalizeVendor = false,
  assignedBy = 'System',
} = {}) {
  const number = Number(orderNumber || 0);
  if (!number && !orderUuid) {
    throw workflowError('MIS order number is required for workflow verification.', 'ORDER_REQUIRED', 400);
  }
  if (!folderId) {
    throw workflowError('Printing folder ID is required for workflow verification.', 'PRINTING_FOLDER_REQUIRED', 400);
  }

  const order = await Orders.findOne(
    orderUuid ? { Order_uuid: String(orderUuid) } : { Order_Number: number },
    { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, assignedTo: 1, assignedToType: 1 }
  ).lean();
  if (!order) {
    throw workflowError('No MIS order matches this Printing folder.', 'MIS_ORDER_MISSING');
  }
  if (number && Number(order.Order_Number) !== number) {
    throw workflowError(
      `Printing folder Order #${number} does not match MIS Order #${order.Order_Number}.`,
      'ORDER_NUMBER_MISMATCH'
    );
  }

  const [customer, finalLink] = await Promise.all([
    Customers.findOne(
      { Customer_uuid: order.Customer_uuid },
      { Customer_uuid: 1, Customer_name: 1 }
    ).lean(),
    DesignFileLink.findOne({
      orderUuid: order.Order_uuid,
      linkStatus: 'confirmed',
      stageNumber: 5,
    }).sort({ updatedAt: -1 }).lean(),
  ]);

  if (!customer) {
    throw workflowError('The MIS order customer could not be resolved.', 'ORDER_CUSTOMER_MISSING');
  }
  if (!finalLink) {
    throw workflowError(
      `Order #${order.Order_Number} has no confirmed Final file.`,
      'CONFIRMED_FINAL_MISSING'
    );
  }
  if (Number(finalLink.orderNumber) !== Number(order.Order_Number)) {
    throw workflowError(
      'The Final file link carries a different order number than the MIS order.',
      'FINAL_ORDER_MISMATCH'
    );
  }
  if (finalLink.customerUuid !== order.Customer_uuid) {
    throw workflowError(
      'The Final file customer does not match the MIS order customer.',
      'FINAL_CUSTOMER_MISMATCH'
    );
  }

  const drive = await getAuthorizedDriveClient();
  const finalState = await isInsideFinalFolder(drive, finalLink.driveFileId);
  if (!finalState.ok) {
    throw workflowError(
      'The confirmed design file is no longer inside a Final folder.',
      'FINAL_FILE_NOT_IN_FINAL'
    );
  }

  const finalFileNumber = extractLeadingOrderNumber(finalState.fileName);
  if (finalFileNumber !== Number(order.Order_Number)) {
    throw workflowError(
      `Final file "${finalState.fileName}" does not start with Order #${order.Order_Number}.`,
      'FINAL_FILENAME_ORDER_MISMATCH'
    );
  }
  if (!includesName(finalState.fileName, customer.Customer_name)) {
    throw workflowError(
      `Final file name does not contain customer "${customer.Customer_name}".`,
      'FINAL_FILENAME_CUSTOMER_MISMATCH'
    );
  }

  const printingFolder = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,trashed',
    supportsAllDrives: true,
  });
  if (printingFolder.data.trashed) {
    throw workflowError('The Printing folder is in Drive trash.', 'PRINTING_FOLDER_TRASHED');
  }

  const actualFolderName = String(printingFolder.data.name || '');
  const printingNumber = extractLeadingOrderNumber(actualFolderName);
  if (printingNumber !== Number(order.Order_Number)) {
    throw workflowError(
      `Printing folder "${actualFolderName}" does not match Order #${order.Order_Number}.`,
      'PRINTING_ORDER_MISMATCH'
    );
  }

  if (
    finalLink.printFolderId
    && String(finalLink.printFolderId) !== String(folderId)
  ) {
    throw workflowError(
      'The Final record points to a different Printing folder for this order.',
      'PRINTING_FOLDER_LINK_MISMATCH'
    );
  }

  let party = null;
  let canonicalFolderName = actualFolderName;

  if (canonicalizeVendor) {
    party = await Customers.findOne(
      {
        Customer_uuid: String(vendorUuid || ''),
        Customer_group: ACCOUNT_PAYABLE_GROUP,
        Status: 'active',
      },
      { Customer_uuid: 1, Customer_name: 1 }
    );
    if (!party) {
      throw workflowError(
        'Selected vendor/freelancer is not an active Account Payable party.',
        'PAYABLE_PARTY_INVALID',
        400
      );
    }

    canonicalFolderName = buildOrderFolderName(
      order.Order_Number,
      [party.Customer_name, customer.Customer_name]
    );

    if (actualFolderName !== canonicalFolderName) {
      await drive.files.update({
        fileId: folderId,
        supportsAllDrives: true,
        requestBody: { name: canonicalFolderName },
        fields: 'id,name',
      });
    }

    await DesignFileLink.updateOne(
      { _id: finalLink._id },
      {
        $set: {
          orderNumber: order.Order_Number,
          customerUuid: order.Customer_uuid,
          customerName: customer.Customer_name,
          printFolderId: folderId,
          assignedTo: party._id,
          assignedToType: 'vendor',
          assignedToName: party.Customer_name,
          assignedBy,
          assignedAt: new Date(),
        },
      }
    );

    const alreadyAssignedToSameVendor =
      order.assignedToType === 'vendor'
      && String(order.assignedTo || '') === String(party._id);

    if (!alreadyAssignedToSameVendor) {
      await assignOrderToUser({
        orderId: order.Order_uuid,
        vendorId: party._id,
        assignedBy,
        via: 'workflow-audit',
      });
    }
  }

  return {
    order,
    customer,
    finalLink,
    party,
    finalFileName: finalState.fileName,
    finalFolderName: finalState.finalFolderName,
    printingFolderName: canonicalFolderName,
    folderId,
  };
}

module.exports = {
  normalizeName,
  extractLeadingOrderNumber,
  verifyPrintingWorkflowIdentity,
};
