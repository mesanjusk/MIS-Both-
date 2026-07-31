// One-time data migration: remap existing Orders.stage / Orders.stageHistory
// and ItemWorkflowTemplate.steps[].stage values from the old 4-value design/
// production split to the new granular stage list introduced alongside the
// home-screen workflow redesign (see constants/orderStages.js):
//
//   'design'        -> 'new_design'   (single remapping — see note below)
//   'printing'      -> 'print'
//   'post_printing' -> 'fitting'
//   'finishing'     -> 'bind_packing'
//
// All other stage values (enquiry, quoted, approved, ready, delivered, paid,
// lost, cancelled) are unchanged and untouched.
//
// IMPORTANT — this must run before (or immediately after) deploying the new
// stage enum. Mongoose only validates enums on write, not on read, so old
// documents keep working for GET/list endpoints either way — but any order
// still holding an old value ('design'/'printing'/'post_printing'/
// 'finishing') will fail validation the next time something calls
// order.save() on it (e.g. any update through the app), because those
// values are no longer in the schema's enum. Run this promptly after
// deploy, not "whenever convenient".
//
// Note on 'design' -> 'new_design': the old single 'design' stage covered
// six new granular sub-stages (new_design/old_design/approval/hold/
// customer/ready_to_print). There is no reliable way to infer which of the
// six an existing order was "really" in from the coarse 'design' value
// alone, so this migration conservatively maps every existing 'design'
// order to 'new_design' (the bucket's entry point) rather than guessing.
// Spot-check the affected orders after migrating and manually move any that
// should actually be further along (e.g. already sent for approval) using
// the normal stage-update flow — the design-loop stages allow that freely.
//
// Usage:
//   node scripts/migrate-stage-enum-v2.js            # dry run — reads only, no writes
//   node scripts/migrate-stage-enum-v2.js --apply    # performs the migration
//
// Connects to process.env.MONGO_URI (same as the running app) — never spins
// up a throwaway database. Run the dry run first and read its report before
// passing --apply.

const path = require('path');

const STAGE_MAP = {
  design: 'new_design',
  printing: 'print',
  post_printing: 'fitting',
  finishing: 'bind_packing',
};

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoose = require('mongoose');

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set — refusing to run against an unknown database.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const Orders = require(path.join(__dirname, '..', 'src', 'repositories', 'order'));
  const ItemWorkflowTemplate = require(path.join(__dirname, '..', 'src', 'repositories', 'itemWorkflowTemplate'));

  console.log(apply ? '=== APPLY MODE — writes will be made ===' : '=== DRY RUN — no writes will be made (pass --apply to migrate) ===');

  // ── Orders.stage ──────────────────────────────────────────────────────
  const oldStageKeys = Object.keys(STAGE_MAP);
  const ordersToFix = await Orders.find({ stage: { $in: oldStageKeys } }, { _id: 1, Order_Number: 1, stage: 1 }).lean();
  console.log(`\nFound ${ordersToFix.length} order(s) with an old stage value.`);

  const stageCounts = {};
  for (const order of ordersToFix) {
    stageCounts[order.stage] = (stageCounts[order.stage] || 0) + 1;
  }
  for (const [oldStage, count] of Object.entries(stageCounts)) {
    console.log(`  ${oldStage} -> ${STAGE_MAP[oldStage]}: ${count} order(s)`);
  }

  if (apply) {
    for (const [oldStage, newStage] of Object.entries(STAGE_MAP)) {
      const res = await Orders.updateMany(
        { stage: oldStage },
        { $set: { stage: newStage } },
        { runValidators: false }
      );
      if (res.modifiedCount) console.log(`  Updated ${res.modifiedCount} order(s): stage ${oldStage} -> ${newStage}`);
    }
  }

  // ── Orders.stageHistory[].stage ──────────────────────────────────────
  // Rewritten per-document (not via $[] positional-all update) so mixed old
  // and new values within a single order's history are each mapped
  // correctly, and unaffected entries are left untouched.
  const ordersWithHistory = await Orders.find(
    { 'stageHistory.stage': { $in: oldStageKeys } },
    { _id: 1, Order_Number: 1, stageHistory: 1 }
  ).lean();
  console.log(`\nFound ${ordersWithHistory.length} order(s) with an old stage value in stageHistory.`);

  if (apply) {
    let historyUpdated = 0;
    for (const order of ordersWithHistory) {
      const newHistory = (order.stageHistory || []).map((entry) => ({
        ...entry,
        stage: STAGE_MAP[entry.stage] || entry.stage,
      }));
      await Orders.updateOne(
        { _id: order._id },
        { $set: { stageHistory: newHistory } },
        { runValidators: false }
      );
      historyUpdated += 1;
    }
    console.log(`  Rewrote stageHistory on ${historyUpdated} order(s).`);
  }

  // ── ItemWorkflowTemplate.steps[].stage ───────────────────────────────
  const templatesToFix = await ItemWorkflowTemplate.find(
    { 'steps.stage': { $in: oldStageKeys } },
    { _id: 1, template_uuid: 1, itemNamePattern: 1, steps: 1 }
  ).lean();
  console.log(`\nFound ${templatesToFix.length} workflow template(s) with an old stage value in steps.`);

  if (apply) {
    let templatesUpdated = 0;
    for (const template of templatesToFix) {
      const newSteps = (template.steps || []).map((step) => ({
        ...step,
        stage: STAGE_MAP[step.stage] || step.stage,
      }));
      await ItemWorkflowTemplate.updateOne(
        { _id: template._id },
        { $set: { steps: newSteps } },
        { runValidators: false }
      );
      templatesUpdated += 1;
    }
    console.log(`  Rewrote steps on ${templatesUpdated} workflow template(s).`);
  }

  console.log(apply ? '\nDone.' : '\nDry run complete — re-run with --apply to write these changes.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
