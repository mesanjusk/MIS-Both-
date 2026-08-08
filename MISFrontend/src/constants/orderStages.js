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

// Cosmetic-only: a handful of older orders still carry a pre-migration
// coarse stage value (e.g. plain 'design') that predates the granular list
// above — display-only label so they read as "Design" instead of the raw
// enum-less string, while WORKFLOW_SECTIONS below still buckets them into
// the right column via its Design fallback. Moving one of these orders (see
// the widget's "Move to stage" action) writes a real, current stage value.
export const LEGACY_STAGE_LABELS = {
  design: 'Design',
  printing: 'Print',
  post_printing: 'Fitting',
  finishing: 'Bind & Packing',
};

// Home-screen Workflow widget column grouping — one column per real
// production stage instead of the old 4 coarse buckets, so the board reads
// as the shop's actual stage-by-stage flow. Pre-assignment stages
// (enquiry/quoted/approved) and today's fresh design work fall back to
// "Today's New" since that's the earliest working stage; "Customer" (waiting
// on customer input) sits with "Design Approval" since both are part of the
// same approval back-and-forth. Ready still folds in delivered/paid so
// closed-out orders don't disappear from the board.
export const WORKFLOW_SECTIONS = [
  {
    key: 'todaysNew',
    label: "Today's New",
    stages: ['enquiry', 'quoted', 'approved', 'new_design'],
  },
  {
    key: 'oldPending',
    label: 'Old Pending',
    stages: ['old_design'],
  },
  {
    key: 'designApproval',
    label: 'Design Approval',
    stages: ['approval', 'customer'],
  },
  {
    key: 'hold',
    label: 'Hold',
    stages: ['hold'],
  },
  {
    key: 'readyToPrint',
    label: 'Ready to Print',
    stages: ['ready_to_print'],
  },
  {
    key: 'print',
    label: 'Print',
    stages: ['print'],
  },
  {
    key: 'fitting',
    label: 'Fitting',
    stages: ['fitting'],
  },
  {
    key: 'bindPack',
    label: 'Bind-Pack',
    stages: ['bind_packing'],
  },
  {
    key: 'ready',
    label: 'Ready',
    stages: ['ready', 'delivered', 'paid'],
  },
];

// Purely a rendering concern for the Workflow board: groups the production
// sub-stage columns above under wide parent buckets, each with a fixed
// share of the board's row width. Does not affect stage bucketing/
// order-moving logic — that still runs entirely off WORKFLOW_SECTIONS.
//
// No "Design" bucket here on purpose: the design sub-stages (Today's New,
// Old Pending, Design Approval, Hold, Ready to Print) are no longer shown
// as a Workflow parent column at all — the Design Files widget is the
// authoritative, always-accurate view for that stage of work (it reads
// live off each file's actual Drive folder), and progression through those
// stages happens by moving files between folders, not from this board.
export const WORKFLOW_GROUPS = [
  {
    key: 'print',
    label: 'Print',
    widthPercent: 27,
    sectionKeys: ['print'],
  },
  {
    key: 'postPrint',
    label: 'Post Print',
    widthPercent: 46,
    sectionKeys: ['fitting', 'bindPack'],
  },
  {
    key: 'ready',
    label: 'Ready',
    widthPercent: 27,
    sectionKeys: ['ready'],
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
