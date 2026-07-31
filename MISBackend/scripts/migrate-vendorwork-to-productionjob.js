// One-time data migration: fold the legacy VendorWork collection (print jobs
// created by the Google-Drive auto-print-job flow) into ProductionJob, now
// that ProductionJob is the single schema for every vendor job — print or
// post-print (see AUDIT_ORDER_PROCESSING_2026-07-31.md and
// services/vendorJobService.js, which is the only writer going forward).
//
// Steps:
//   1. For every VendorWork doc, create a matching ProductionJob
//      (job_category: 'printing', driveFileId resolved via DesignFileLink).
//   2. Repoint DesignFileLink.printJobId from the old VendorWork.work_uuid
//      to the new ProductionJob.job_uuid.
//   3. Backfill job_category on existing ProductionJob rows still sitting at
//      the old default ('general'): job_type === 'printing' -> 'printing',
//      otherwise (has a vendor_uuid) -> 'post_printing'.
//
// VendorWork itself is left in place (untouched) so this migration has a
// rollback path — drop the collection in a separate cleanup change only
// after production data has been spot-checked.
//
// Usage:
//   node scripts/migrate-vendorwork-to-productionjob.js            # dry run — reads only, no writes
//   node scripts/migrate-vendorwork-to-productionjob.js --apply    # performs the migration
//
// Connects to process.env.MONGO_URI (same as the running app) — never spins
// up a throwaway database. Run the dry run first and read its report before
// passing --apply.

const path = require('path');

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoose = require('mongoose');
  const { v4: uuid } = require('uuid');

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set — refusing to run against an unknown database.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const VendorWork = require(path.join(__dirname, '..', 'src', 'repositories', 'vendorWork'));
  const ProductionJob = require(path.join(__dirname, '..', 'src', 'repositories', 'productionJob'));
  const DesignFileLink = require(path.join(__dirname, '..', 'src', 'repositories', 'DesignFileLink'));
  const { mapVendorJobType } = require(path.join(__dirname, '..', 'src', 'utils', 'orderHelpers'));

  console.log(apply ? '=== APPLY MODE — writes will be made ===' : '=== DRY RUN — no writes will be made (pass --apply to migrate) ===');

  // ── Step 1+2: VendorWork -> ProductionJob, repoint DesignFileLink.printJobId ──
  const works = await VendorWork.find({}).lean();
  console.log(`\nFound ${works.length} VendorWork doc(s) to migrate.`);

  const statusMap = { draft: 'draft', sent: 'sent', completed: 'completed', paid: 'completed' };
  let createdCount = 0;
  let linkRepointedCount = 0;

  for (const work of works) {
    const link = await DesignFileLink.findOne({ printJobId: work.work_uuid }).lean();
    const newJobUuid = uuid();

    const jobDoc = {
      job_uuid: newJobUuid,
      job_category: 'printing',
      job_type: mapVendorJobType(work.Process) || 'printing',
      job_mode: work.Material_Source === 'vendor' ? 'vendor_with_material'
        : work.Material_Source === 'mixed' ? 'mixed'
        : 'own_material_sent',
      vendor_uuid: work.Vendor_uuid || '',
      vendor_name: work.Vendor_name || '',
      job_date: work.Date || work.createdAt || new Date(),
      order_uuid: work.Order_uuid || '',
      order_number: work.Order_Number ?? null,
      status: statusMap[work.Status] || 'draft',
      paymentStatus: work.Status === 'paid' ? 'paid' : 'pending',
      linkedOrders: work.Order_uuid ? [{
        orderUuid: work.Order_uuid,
        orderNumber: work.Order_Number ?? null,
        orderItemLineId: '',
        quantity: Number(work.Input_Qty || 0),
        outputQuantity: Number(work.Output_Qty || 0),
        costShareAmount: Number(work.Amount || 0),
        allocationBasis: 'manual',
      }] : [],
      inputItems: work.Input_Item_Name ? [{ itemName: work.Input_Item_Name, itemType: 'raw', quantity: Number(work.Input_Qty || 0) }] : [],
      outputItems: work.Output_Item_Name ? [{ itemName: work.Output_Item_Name, itemType: 'semi_finished', quantity: Number(work.Output_Qty || 0) }] : [],
      advanceAmount: Number(work.Advance_Amount || 0),
      jobValue: Number(work.Amount || 0),
      notes: work.Notes || '',
      driveFileId: link?.driveFileId || '',
      createdBy: 'migrate-vendorwork-to-productionjob',
    };

    console.log(`  VendorWork ${work.work_uuid} (${work.Vendor_name}, order #${work.Order_Number ?? '-'}) -> ProductionJob ${newJobUuid}${link ? ` (DesignFileLink ${link.driveFileId} repointed)` : ' (no DesignFileLink found)'}`);

    if (apply) {
      await ProductionJob.create(jobDoc);
      createdCount += 1;
      if (link) {
        await DesignFileLink.updateOne({ _id: link._id }, { $set: { printJobId: newJobUuid } });
        linkRepointedCount += 1;
      }
    }
  }

  // ── Step 3: backfill job_category on existing 'general' ProductionJob rows ──
  const generalJobs = await ProductionJob.find({ job_category: 'general' }).lean();
  console.log(`\nFound ${generalJobs.length} ProductionJob doc(s) still at job_category: 'general'.`);

  let backfilledPrinting = 0;
  let backfilledPostPrinting = 0;
  let leftGeneral = 0;

  for (const job of generalJobs) {
    let newCategory = null;
    if (job.job_type === 'printing') newCategory = 'printing';
    else if (job.vendor_uuid) newCategory = 'post_printing';

    if (!newCategory) { leftGeneral += 1; continue; }
    if (newCategory === 'printing') backfilledPrinting += 1; else backfilledPostPrinting += 1;

    if (apply) {
      await ProductionJob.updateOne({ _id: job._id }, { $set: { job_category: newCategory } });
    }
  }

  console.log(`  -> printing: ${backfilledPrinting}, post_printing: ${backfilledPostPrinting}, left as general (no vendor_uuid): ${leftGeneral}`);

  console.log(`\n${apply ? 'Applied' : 'Would apply'}: ${apply ? createdCount : works.length} ProductionJob(s) created from VendorWork, ${apply ? linkRepointedCount : works.length} DesignFileLink(s) repointed, ${backfilledPrinting + backfilledPostPrinting} job_category backfill(s).`);
  if (!apply) console.log('\nRe-run with --apply to perform this migration.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration script crashed:', err);
  process.exit(1);
});
