// Read-only item detail lookup for customer statements. Neither this service
// nor the statement UI changes invoice postings or double-entry journal lines.
const Orders = require('../repositories/order');
const PublicInvoice = require('../repositories/publicInvoice');

const cleanItems = (source) => (Array.isArray(source) ? source : []).map((item) => ({
  name: String(item?.Item || item?.itemName || item?.name || '').trim(),
  quantity: Number(item?.Quantity ?? item?.qty ?? 0),
  rate: Number(item?.Rate ?? item?.rate ?? 0),
  amount: Number(item?.Amount ?? item?.amount ?? 0),
  remark: String(item?.Remark || item?.remark || '').trim(),
})).filter((item) => item.name);

const cleanCharges = (source) => (Array.isArray(source) ? source : []).map((charge) => ({
  label: String(charge?.label || charge?.Label || '').trim(),
  amount: Number(charge?.amount ?? charge?.Amount ?? 0),
})).filter((charge) => charge.label);

function hasInvoiceSource(transaction) {
  if (!transaction || (!transaction.Order_uuid && !transaction.Order_number)) return false;
  const source = String(transaction.Source || '').toLowerCase().trim();
  if (source === 'invoice' || source.startsWith('business:customer_invoice')) return true;
  return (transaction.Journal_entry || []).some((line) =>
    String(line?.Type || '').toLowerCase() === 'credit' &&
    ['sales'].includes(String(line?.Account_name || line?.Account_id || '').toLowerCase())
  );
}

async function getStatementInvoiceDetails(transactions) {
  const invoices = (transactions || []).filter(hasInvoiceSource);
  if (!invoices.length) return {};
  const uuids = [...new Set(invoices.map((t) => String(t.Order_uuid || '').trim()).filter(Boolean))];
  const numbers = [...new Set(invoices.map((t) => Number(t.Order_number)).filter((n) => Number.isSafeInteger(n) && n > 0))];
  const clauses = [];
  if (uuids.length) clauses.push({ Order_uuid: { $in: uuids } });
  if (numbers.length) clauses.push({ Order_Number: { $in: numbers } });
  if (!clauses.length) return {};

  const orders = await Orders.find({ $or: clauses }, {
    Order_uuid: 1, Order_Number: 1, Items: 1, extraCharges: 1, orderNote: 1,
  }).lean();
  const byUuid = new Map(orders.map((order) => [String(order.Order_uuid), order]));
  const byNumber = new Map(orders.map((order) => [String(order.Order_Number), order]));
  const publishedNumbers = [...new Set(invoices.map((txn) => {
    const found = (txn.Order_uuid && byUuid.get(String(txn.Order_uuid))) ||
      byNumber.get(String(txn.Order_number));
    return String(found?.Order_Number || txn.Order_number || '');
  }).filter(Boolean))];

  // The shared invoice is a snapshot of the document the customer received.
  // Prefer its line items when available; old entries fall back to order Items.
  const published = publishedNumbers.length ? await PublicInvoice.find({
    orderNumber: { $in: publishedNumbers },
    $or: [{ docType: 'invoice' }, { docType: { $exists: false } }],
  }, { orderNumber: 1, items: 1, extraCharges: 1 })
    .sort({ createdAt: -1 }).lean() : [];
  const sharedByNumber = new Map();
  published.forEach((doc) => {
    const key = String(doc.orderNumber || '');
    if (!sharedByNumber.has(key) && cleanItems(doc.items).length) sharedByNumber.set(key, doc);
  });

  return Object.fromEntries(invoices.map((txn) => {
    const order = (txn.Order_uuid && byUuid.get(String(txn.Order_uuid))) ||
      byNumber.get(String(txn.Order_number)) || null;
    const number = String(order?.Order_Number || txn.Order_number || '');
    const shared = sharedByNumber.get(number);
    const source = shared || order;
    return [txn.Transaction_uuid, {
      items: cleanItems(source?.items || source?.Items),
      extraCharges: cleanCharges(source?.extraCharges),
      source: shared ? 'issued_invoice' : order ? 'order' : 'unavailable',
    }];
  }).filter(([id]) => Boolean(id)));
}

module.exports = { cleanItems, cleanCharges, hasInvoiceSource, getStatementInvoiceDetails };
