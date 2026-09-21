const Orders = require('../repositories/order');
const Customers = require('../repositories/customer');
const DesignFileLink = require('../repositories/DesignFileLink');

function normalizeName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrintingFolderName(name = '') {
  const raw = String(name || '').trim();
  const match = raw.match(/^(\d+)\s*(.*)$/);
  if (!match) {
    return { orderNumber: null, vendorName: '', customerName: '', raw };
  }

  const orderNumber = Number(match[1]);
  const tail = String(match[2] || '').replace(/^[\s_-]+/, '').trim();
  if (!tail) return { orderNumber, vendorName: '', customerName: '', raw };

  const separator = tail.match(/\s+-\s+/);
  if (!separator) {
    return { orderNumber, vendorName: tail, customerName: '', raw };
  }

  const splitAt = separator.index;
  return {
    orderNumber,
    vendorName: tail.slice(0, splitAt).trim(),
    customerName: tail.slice(splitAt + separator[0].length).trim(),
    raw,
  };
}

function namesMatch(expected, actual) {
  const a = normalizeName(expected);
  const b = normalizeName(actual);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function validateProductionChain({
  orderUuid,
  orderNumber,
  printingFolderId,
  printingFolderName,
  printingVendorUuid,
}) {
  const query = orderUuid
    ? { Order_uuid: String(orderUuid) }
    : { Order_Number: Number(orderNumber) };

  const order = await Orders.findOne(query, {
    Order_uuid: 1,
    Order_Number: 1,
    Customer_uuid: 1,
    stage: 1,
  }).lean();

  if (!order) {
    return {
      ok: false,
      code: 'ORDER_NOT_FOUND',
      message: 'MIS order not found for this Printing job.',
      checks: {},
    };
  }

  const customer = order.Customer_uuid
    ? await Customers.findOne(
        { Customer_uuid: order.Customer_uuid },
        { Customer_name: 1 }
      ).lean()
    : null;

  const links = await DesignFileLink.find(
    { orderUuid: order.Order_uuid, linkStatus: 'confirmed' },
    {
      driveFileId: 1,
      fileName: 1,
      orderUuid: 1,
      orderNumber: 1,
      customerName: 1,
      printFolderId: 1,
      stageNumber: 1,
      linkStatus: 1,
    }
  ).lean();

  const finalLink = links.find((link) => Number(link.orderNumber) === Number(order.Order_Number))
    || links[0]
    || null;

  const parsedPrinting = parsePrintingFolderName(printingFolderName);
  const selectedVendor = printingVendorUuid
    ? await Customers.findOne(
        { Customer_uuid: String(printingVendorUuid) },
        { Customer_name: 1 }
      ).lean()
    : null;

  const checks = {
    finalLinked: Boolean(finalLink),
    finalOrderNumberMatch: Boolean(
      finalLink && Number(finalLink.orderNumber) === Number(order.Order_Number)
    ),
    finalFileNumberMatch: Boolean(
      finalLink && new RegExp(`^${order.Order_Number}(?:\\s|[-_])`).test(String(finalLink.fileName || ''))
    ),
    printingFolderLinked: Boolean(
      printingFolderId
      && finalLink?.printFolderId
      && String(finalLink.printFolderId) === String(printingFolderId)
    ),
    printingOrderNumberMatch: Boolean(
      parsedPrinting.orderNumber
      && Number(parsedPrinting.orderNumber) === Number(order.Order_Number)
    ),
    customerMatch: Boolean(
      customer?.Customer_name
      && parsedPrinting.customerName
      && namesMatch(customer.Customer_name, parsedPrinting.customerName)
    ),
    vendorMatch: printingVendorUuid
      ? Boolean(
          selectedVendor?.Customer_name
          && parsedPrinting.vendorName
          && namesMatch(selectedVendor.Customer_name, parsedPrinting.vendorName)
        )
      : true,
  };

  const required = [
    'finalLinked',
    'finalOrderNumberMatch',
    'finalFileNumberMatch',
    'printingFolderLinked',
    'printingOrderNumberMatch',
    'customerMatch',
    'vendorMatch',
  ];
  const failed = required.filter((key) => !checks[key]);

  return {
    ok: failed.length === 0,
    code: failed.length ? 'WORKFLOW_CHAIN_MISMATCH' : 'OK',
    message: failed.length
      ? `Workflow audit failed: ${failed.join(', ')}`
      : 'Final, Printing and MIS order match.',
    order,
    customerName: customer?.Customer_name || '',
    finalLink,
    parsedPrinting,
    selectedVendorName: selectedVendor?.Customer_name || '',
    checks,
    failed,
  };
}

module.exports = {
  normalizeName,
  parsePrintingFolderName,
  namesMatch,
  validateProductionChain,
};
