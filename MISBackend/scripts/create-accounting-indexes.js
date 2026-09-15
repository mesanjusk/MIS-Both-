// scripts/create-accounting-indexes.js
//
// Install the accounting indexes on a deployed database.
//
// Production runs with autoIndex disabled and does not call syncIndexes, so
// declaring an index in the schema does not create it on the server. This
// script does, and reports what would block a unique index before trying.
//
//   node scripts/create-accounting-indexes.js            # report only
//   node scripts/create-accounting-indexes.js --apply    # create the indexes

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set. Set it in your environment or .env file before running this script.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

/** Duplicate values that would make a unique index on `field` fail. */
async function findDuplicates(collection, field) {
  return collection.aggregate([
    { $match: { [field]: { $nin: [null, ""] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).toArray();
}

(async () => {
  try {
    await mongoose.connect(MONGO_URI, {});
    const Transactions = mongoose.connection.collection("transactions");

    // Event_key — stops a concurrent retry from posting the same business event
    // twice. Only rows written since the field was introduced carry a value.
    const eventKeyDupes = await findDuplicates(Transactions, "Event_key");

    // Transaction_id — the old max+1 allocators could hand out the same number
    // to two concurrent callers, so historical duplicates are possible. Report
    // them rather than failing; they must be renumbered before a unique index
    // can exist, and renumbering is a decision for the business, not a script.
    const txnIdDupes = await findDuplicates(Transactions, "Transaction_id");

    console.log(`\nDuplicate Event_key values      : ${eventKeyDupes.length}`);
    console.log(`Duplicate Transaction_id values : ${txnIdDupes.length}`);

    if (txnIdDupes.length) {
      console.log("\n  Transaction_id values used more than once:");
      for (const d of txnIdDupes) console.log(`    ${d._id} × ${d.count}`);
      console.log("  These are historical; a unique index on Transaction_id is NOT created.");
      console.log("  New numbers come from the shared atomic counter and will not collide.");
    }

    if (eventKeyDupes.length) {
      console.log("\n  ⚠ Event_key duplicates must be resolved before the unique index can be created:");
      for (const d of eventKeyDupes) console.log(`    ${d._id} × ${d.count}`);
    }

    if (!APPLY) {
      console.log("\nReport only — nothing created. Re-run with --apply to create the indexes.");
      await mongoose.disconnect();
      process.exit(0);
    }

    if (eventKeyDupes.length) {
      console.error("\n❌ Refusing to create the Event_key unique index while duplicates exist.");
      await mongoose.disconnect();
      process.exit(1);
    }

    await Transactions.createIndex(
      { Event_key: 1 },
      { unique: true, partialFilterExpression: { Event_key: { $type: "string" } }, name: "Event_key_unique" }
    );
    console.log("\n✅ Created unique partial index on Event_key.");

    await Transactions.createIndex({ Source: 1, Order_uuid: 1 }, { name: "Source_Order_uuid" });
    await Transactions.createIndex({ Source: 1, Order_number: 1 }, { name: "Source_Order_number" });
    console.log("✅ Created duplicate-guard lookup indexes on Source + order reference.");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Index creation failed:", err.message);
    process.exit(1);
  }
})();
