// Single source of truth for order stages. Previously five files each
// defined their own copy of this list with inconsistent membership.

const ORDER_STAGES = [
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

// Terminal stages: an order here needs no further stage-forward action.
const CLOSED_STAGES = new Set(['delivered', 'paid', 'lost', 'cancelled']);

// Stages that never had a real order start (used to distinguish "lost
// before we started work" from "cancelled after work started").
const PRE_WORK_STAGES = new Set(['enquiry', 'quoted']);

const stageIndex = new Map(ORDER_STAGES.map((stage, index) => [stage, index]));

function isValidStage(stage) {
  return stageIndex.has(stage);
}

function isClosedStage(stage) {
  return CLOSED_STAGES.has(stage);
}

// 'lost' and 'cancelled' are listed last, so a plain index comparison
// already treats them as reachable exits from any earlier (open) stage,
// while blocking a move back out of them once set — which is the
// behavior we want for terminal stages.
function isForwardMove(fromStage, toStage) {
  if (!isValidStage(fromStage) || !isValidStage(toStage)) return false;
  return stageIndex.get(toStage) >= stageIndex.get(fromStage);
}

module.exports = {
  ORDER_STAGES,
  CLOSED_STAGES,
  PRE_WORK_STAGES,
  stageIndex,
  isValidStage,
  isClosedStage,
  isForwardMove,
};
