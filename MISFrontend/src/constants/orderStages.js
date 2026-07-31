// Mirrors MISBackend/src/constants/orderStages.js. Previously the stage
// list was hardcoded independently (with different values/casing) in
// BusinessControl.jsx, allOrdersList.jsx, OrderKanban.jsx, and
// OrderUpdate.jsx.

// Canonical stage values (matches the backend `stage` enum), used by
// screens driven off order.stage: BusinessControl, allOrdersList.
export const ORDER_STAGES = [
  'enquiry',
  'quoted',
  'approved',
  'design',
  'printing',
  'post_printing',
  'finishing',
  'ready',
  'delivered',
  'paid',
  'lost',
  'cancelled',
];

export const STAGE_LABELS = {
  enquiry: 'Enquiry',
  quoted: 'Quoted',
  approved: 'Approved',
  design: 'Design',
  printing: 'Printing',
  post_printing: 'Post Printing',
  finishing: 'Finishing',
  ready: 'Ready',
  delivered: 'Delivered',
  paid: 'Paid',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

export const CLOSED_STAGES = new Set(['delivered', 'paid', 'lost', 'cancelled']);

// Older screens (OrderKanban, OrderUpdate) track stage via the free-text
// Status[].Task log rather than order.stage, using Title Case labels.
// Reconciling that with order.stage is a larger follow-up, not part of
// this pass — this list only makes the two Status.Task-driven screens
// agree with each other.
export const STATUS_TASK_STAGES = [
  'Enquiry',
  'Design',
  'Printing',
  'Post Printing',
  'Finishing',
  'Ready',
  'Delivered',
  'Lost',
  'Cancelled',
];
