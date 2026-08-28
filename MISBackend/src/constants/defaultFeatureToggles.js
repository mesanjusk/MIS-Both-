/**
 * Reversible defaults for screens and one-time maintenance endpoints that are
 * not part of the current day-to-day MIS workflow.
 *
 * These are inserted only when a toggle has never existed. If an admin turns
 * one back on from API Performance, its existing database row is preserved on
 * every later deploy.
 */

const DEFAULT_DISABLED_PAGES = [
  ['/Attendance-Report', 'Legacy attendance report alias; use /attendance/report.'],
  ['/WhatsAppHome', 'Legacy WhatsApp landing page; use /whatsapp.'],
  ['/WhatsAppBroadcastPage', 'Legacy broadcast alias; use the Broadcast tab in /whatsapp.'],
  ['/WhatsAppSendPage', 'Legacy message alias; use the Templates tab in /whatsapp.'],
  ['/SendMessage', 'Legacy message screen; use the Templates tab in /whatsapp.'],
  ['/whatsapp-cloud', 'Duplicate WhatsApp route; use /whatsapp.'],
  ['/whatsapp/send', 'Standalone composer duplicated by /whatsapp.'],
  ['/whatsapp/broadcast', 'Standalone broadcast screen duplicated by /whatsapp.'],
  ['/allOrder', 'Duplicate order board route; use /reports/orders.'],
  ['/allDelivery', 'Duplicate delivery report route; use /reports/delivery.'],
  ['/allTransaction', 'Duplicate account book route; use /reports/transactions.'],
  ['/allTransaction1', 'Older outstanding report; use /reports/outstanding.'],
  ['/allTransaction2', 'Duplicate outstanding report; use /reports/outstanding.'],
  ['/allTransaction4D', 'Daily cash/bank view is already available on Home.'],
  ['/customerReport', 'Duplicate customer report route; use /reports/customers.'],
  ['/itemReport', 'Duplicate item report route; use /reports/items.'],
  ['/taskReport', 'Duplicate task report route; use /reports/tasks.'],
  ['/userReport', 'Duplicate user report route; use /reports/users.'],
].map(([key, note]) => ({ key, kind: 'page', note }));

const DEFAULT_DISABLED_APIS = [
  ['GET /api/orders-migrate/migrate/flat', 'One-time legacy order migration.'],
  ['POST /api/orders-migrate/migrate/ids', 'One-time legacy order migration.'],
  ['POST /api/orders-migrate/migrate/all', 'One-time legacy order migration.'],
  ['POST /api/public-invoices/migrate', 'One-time public invoice backfill.'],
  ['POST /api/purchaseorder/backfill-dates', 'One-time purchase-order date backfill.'],
  ['POST /api/purchaseorder/backfill-postings', 'One-time vendor-ledger posting backfill.'],
  ['GET /api/accounts/fix-opening-balance-uuid', 'One-time opening-balance repair.'],
  ['POST /api/design-files/renumber', 'One-time Drive archive renumbering tool.'],
  ['POST /api/design-files/cleanup-print-folders', 'One-time duplicate-folder cleanup tool.'],
  ['POST /api/design-files/temp-orders', 'One-time temporary-order cleanup tool.'],
  ['POST /api/sop/seed', 'Initial SOP seed; normal SOP editing remains available.'],
  ['POST /api/operations/seed', 'Initial Operations seed; normal settings remain available.'],
].map(([key, note]) => ({ key, kind: 'api', note }));

const DEFAULT_FEATURE_TOGGLES = [...DEFAULT_DISABLED_PAGES, ...DEFAULT_DISABLED_APIS];
const DEFAULT_DISABLED_KEYS = new Set(DEFAULT_FEATURE_TOGGLES.map((entry) => entry.key));

module.exports = {
  DEFAULT_DISABLED_APIS,
  DEFAULT_DISABLED_PAGES,
  DEFAULT_FEATURE_TOGGLES,
  DEFAULT_DISABLED_KEYS,
};
