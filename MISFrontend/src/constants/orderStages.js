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

// Home-screen Workflow widget column grouping. Mirrors the physical
// production pipeline the team actually works off: New/Old Design +
// Approval/Hold/Customer sit together as "Design", Ready to Print and
// Print share a "Print" column, Fitting and Bind & Packing share "Post
// Print", and Ready is the final "Ready & Archive" column. Any stage not
// listed here (enquiry/quoted/approved — pre-assignment) falls back to
// Design since that's the earliest working stage.
export const WORKFLOW_SECTIONS = [
  {
    key: 'design',
    label: 'Design',
    stages: ['enquiry', 'quoted', 'approved', 'new_design', 'old_design', 'approval', 'hold', 'customer'],
  },
  {
    key: 'print',
    label: 'Print',
    stages: ['ready_to_print', 'print'],
  },
  {
    key: 'postPrint',
    label: 'Post Print',
    stages: ['fitting', 'bind_packing'],
  },
  {
    key: 'ready',
    label: 'Ready & Archive',
    stages: ['ready', 'delivered', 'paid'],
  },
];

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
