/**
 * Which queues an OrderControlPanel renders.
 *
 * Kept out of the component file so each module exports one kind of thing, and
 * so a host can name a section set without importing the panel itself.
 */

/** Everything order-shaped: the queues that belong with the Workflow board. */
export const ORDER_SECTIONS = [
  'openOrders',
  'unassignedOrders',
  'readyNotDelivered',
  'deliveredUnpaid',
  'overdueTasks',
  // Not a queue and never a tab — naming it only lights up its counter.
  'todayReceipts',
];

/** Vendor money, which belongs with the ledger rather than the board. */
export const VENDOR_SECTIONS = ['vendorPayable'];
