// Single source of truth for order stages. Previously five files each
// defined their own copy of this list with inconsistent membership.

const ORDER_STAGES = [
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

// Terminal stages: an order here needs no further stage-forward action.
const CLOSED_STAGES = new Set(['delivered', 'paid', 'lost', 'cancelled']);

// Stages that never had a real order start (used to distinguish "lost
// before we started work" from "cancelled after work started").
const PRE_WORK_STAGES = new Set(['enquiry', 'quoted']);

// Design-review stages loop rather than move strictly forward — an order can
// bounce between 'approval' and 'old_design' (revision requested) more than
// once before it's finalized, unlike production stages which are one-way.
const DESIGN_LOOP_STAGES = new Set([
  'new_design',
  'old_design',
  'approval',
  'hold',
  'customer',
  'ready_to_print',
]);

// Coarse stage values used before the design/production pipeline was split
// into the granular list above. A handful of older orders never got
// migrated off these and would otherwise get permanently stuck — every
// stage-mutating path (assign, move-to-stage) normalizes through this map
// first instead of rejecting them outright, so an old order self-heals the
// moment someone assigns or moves it rather than needing a one-off bulk
// migration script run against production.
const LEGACY_STAGE_ALIASES = {
  design: 'new_design',
  printing: 'print',
  post_printing: 'fitting',
  finishing: 'bind_packing',
};

// Which team "capability" tag can pick up work at each stage — drives the
// stage-filtered assignee picker (GET /api/assignees) so a design order only
// offers designers/design-freelancers, a print order only offers printers/
// print vendors, etc. Post-print here deliberately covers both fitting and
// bind_packing (the shop treats those as one "post-print" skill), matching
// how WORKFLOW_GROUPS folds the same two stages into one "Post Print" column
// on the frontend Workflow board.
const STAGE_CAPABILITY = {
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

function capabilityForStage(stage) {
  return STAGE_CAPABILITY[stage] || null;
}

const stageIndex = new Map(ORDER_STAGES.map((stage, index) => [stage, index]));

function isValidStage(stage) {
  return stageIndex.has(stage);
}

// Maps a legacy stage value to its modern equivalent; passes through
// anything already valid (or entirely unrecognized — callers still need to
// validate the result themselves).
function normalizeLegacyStage(stage) {
  return LEGACY_STAGE_ALIASES[stage] || stage;
}

function isClosedStage(stage) {
  return CLOSED_STAGES.has(stage);
}

// 'lost' and 'cancelled' are listed last, so a plain index comparison
// already treats them as reachable exits from any earlier (open) stage,
// while blocking a move back out of them once set — which is the
// behavior we want for terminal stages. Design-loop stages are exempted
// from the forward-only rule in both directions, so a revision request can
// send an order from 'approval' back to 'old_design' without special-casing
// every caller of updateOrderStage.
function isForwardMove(fromStage, toStage) {
  if (!isValidStage(fromStage) || !isValidStage(toStage)) return false;
  if (DESIGN_LOOP_STAGES.has(fromStage) && DESIGN_LOOP_STAGES.has(toStage)) return true;
  return stageIndex.get(toStage) >= stageIndex.get(fromStage);
}

module.exports = {
  ORDER_STAGES,
  CLOSED_STAGES,
  PRE_WORK_STAGES,
  DESIGN_LOOP_STAGES,
  LEGACY_STAGE_ALIASES,
  STAGE_CAPABILITY,
  stageIndex,
  isValidStage,
  isClosedStage,
  isForwardMove,
  normalizeLegacyStage,
  capabilityForStage,
};
