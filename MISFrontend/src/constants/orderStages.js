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

// Mirrors MISBackend/src/constants/orderStages.js STAGE_CAPABILITY — which
// team "capability" tag can pick up work at each stage. Drives the
// stage-filtered assignee picker on OrderTaskList: a design-stage task only
// offers people/parties tagged 'design' (or untagged — untagged means no
// restriction), a print-stage task only offers 'print', etc. Post-print
// covers both fitting and bind_packing, same as WORKFLOW_GROUPS below.
export const STAGE_TO_CAPABILITY = {
  enquiry: 'design',
  quoted: 'design',
  approved: 'design',
  new_design: 'design',
  old_design: 'design',
  approval: 'design',
  hold: 'design',
  customer: 'design',
  ready_to_print: 'design',
  print: 'print',
  fitting: 'postprint',
  bind_packing: 'postprint',
  ready: 'delivery',
  delivered: 'delivery',
  paid: 'delivery',
};

export const CAPABILITY_LABELS = {
  design: 'Design',
  print: 'Print',
  postprint: 'Post-Print (Fitting/Bind-Pack)',
  delivery: 'Ready/Delivery',
};

// Badge labels for the assign menu. 'employee' = in-house Users; 'payable' =
// Customers under the "Account Payable" group (vendors/freelancers/
// contractors/anyone this business owes money to) — see
// MISBackend/src/routes/Assignees.js for why that's the source instead of
// the separate, mostly auto-populated vendor_masters collection.
export const ASSIGNEE_TYPE_LABELS = {
  employee: 'Employee',
  payable: 'Account Payable',
};

// Case/whitespace-tolerant match for the Customer_group value that marks a
// customer record as an Account Payable party — mirrors the backend's
// ACCOUNT_PAYABLE_GROUP regex in MISBackend/src/routes/Assignees.js. Used to
// conditionally show the "Works on (stage)" picker on the Customer form.
export const isAccountPayableGroup = (group = '') => /^account\s*payable$/i.test(String(group || '').trim());

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
// The "design" bucket has no sectionKeys — it isn't rendered as stage
// sub-columns at all. Its 45% of the row instead holds the Design Files
// widget directly (see WorkflowWidget's isDesignFilesGroup check), since
// that widget's own "Design Board" tab is the authoritative, always-
// accurate view of design-stage work (reads live off each file's actual
// Drive folder) — the design sub-stages (Today's New, Old Pending, Design
// Approval, Hold, Ready to Print) move automatically as files change
// folders, not from a manual column here.
export const WORKFLOW_GROUPS = [
  {
    key: 'design',
    label: 'Design',
    widthPercent: 52,
    sectionKeys: [],
  },
  {
    key: 'print',
    label: 'Print',
    widthPercent: 12,
    sectionKeys: ['print'],
  },
  {
    key: 'postPrint',
    label: 'Post Print',
    widthPercent: 24,
    sectionKeys: ['fitting', 'bindPack'],
  },
  {
    key: 'ready',
    label: 'Ready',
    widthPercent: 12,
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
