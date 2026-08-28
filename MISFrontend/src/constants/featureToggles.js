export const FEATURE_TOGGLE_KEYS = Object.freeze({
  PUBLIC_INVOICE_MIGRATION: 'POST /api/public-invoices/migrate',
  PURCHASE_ORDER_POSTING_BACKFILL: 'POST /api/purchaseorder/backfill-postings',
  SOP_SEED: 'POST /api/sop/seed',
  OPERATIONS_SEED: 'POST /api/operations/seed',
  DESIGN_RENUMBER: 'POST /api/design-files/renumber',
  DESIGN_FOLDER_CLEANUP: 'POST /api/design-files/cleanup-print-folders',
  DESIGN_TEMP_ORDER_CLEANUP: 'POST /api/design-files/temp-orders',
});
