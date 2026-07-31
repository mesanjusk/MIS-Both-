// Mirrors MISBackend/src/constants/orderStages.js. Previously the stage
// list was hardcoded independently (with different values/casing) in
// BusinessControl.jsx, allOrdersList.jsx, OrderKanban.jsx, and
// OrderUpdate.jsx.

// Canonical stage values (matches the backend `stage` enum), used by
// screens driven off order.stage: BusinessControl, allOrdersList,
// WorkflowTemplates, PostPrintingControl/Job, OrderBoard.
export const ORDER_STAGES = [
  'enquiry',
  'quoted',
  'approved',
  'new_design',
  'old_design',
  'approval',
  'hold',
  'customer',
  'ready_to_print',
  'print',
  'fitting',
  'bind_packing',
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
  new_design: 'New Design',
  old_design: 'Old Design',
  approval: 'Approval',
  hold: 'Hold',
  customer: 'Customer',
  ready_to_print: 'Ready to Print',
  print: 'Print',
  fitting: 'Fitting',
  bind_packing: 'Bind & Packing',
  ready: 'Ready',
  delivered: 'Delivered',
  paid: 'Paid',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

export const CLOSED_STAGES = new Set(['delivered', 'paid', 'lost', 'cancelled']);

// Design-review stages loop rather than move strictly forward (see the
// backend constants file for the matching isForwardMove exception).
export const DESIGN_LOOP_STAGES = new Set([
  'new_design',
  'old_design',
  'approval',
  'hold',
  'customer',
  'ready_to_print',
]);

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
