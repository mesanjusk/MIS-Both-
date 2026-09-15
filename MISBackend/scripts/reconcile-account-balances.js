// scripts/reconcile-account-balances.js
//
// Recompute every Accounts.Balance from the transaction journal and report (or
// repair) the difference.
//
// Transaction edits and deletions used to leave their balance movement applied,
// so stored balances drifted away from the ledger. The routes no longer drift,
// but balances that already drifted stay wrong until they are rebuilt from the
// journal — which is what this does.
//
//   node scripts/reconcile-account-balances.js            # dry run, reports only
//   node scripts/reconcile-account-balances.js --apply    # writes corrections
//
// Take a database backup before running with --apply.

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set. Set it in your environment or .env file before running this script.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

// Balances are money; compare at 2dp so float noise is not reported as drift.
const round2 = (n) => Number(Number(n).toFixed(2));

(async () => {
  try {
    await mongoose.connect(MONGO_URI, {});

    const Accounts     = mongoose.connection.collection("accounts");
    const Transactions = mongoose.connection.collection("transactions");

    // Ledger truth: net movement per account, straight from the journal lines.
    const totals = await Transactions.aggregate([
      { $unwind: "$Journal_entry" },
      {
        $group: {
          _id: "$Journal_entry.Account_id",
          debit: {
            $sum: { $cond: [{ $eq: ["$Journal_entry.Type", "Debit"] }, "$Journal_entry.Amount", 0] },
          },
          credit: {
            $sum: { $cond: [{ $eq: ["$Journal_entry.Type", "Credit"] }, "$Journal_entry.Amount", 0] },
          },
        },
      },
    ]).toArray();

    const totalsByUuid = new Map(totals.map((t) => [t._id, t]));

    const accounts = await Accounts.find(
      {},
      { projection: { Account_uuid: 1, Account_name: 1, Normal_balance_side: 1, Balance: 1 } }
    ).toArray();

    const drifted = [];

    for (const acct of accounts) {
      const t          = totalsByUuid.get(acct.Account_uuid) || { debit: 0, credit: 0 };
      const normalSide = String(acct.Normal_balance_side || "debit").toLowerCase();
      const expected   = round2(normalSide === "credit" ? t.credit - t.debit : t.debit - t.credit);
      const stored     = round2(acct.Balance || 0);

      if (expected !== stored) {
        drifted.push({
          uuid: acct.Account_uuid,
          name: acct.Account_name,
          stored,
          expected,
          delta: round2(expected - stored),
        });
      }
    }

    // Journal lines can reference customer records rather than Accounts rows;
    // those have no stored balance to reconcile and are reported, not written.
    const orphans = totals
      .map((t) => t._id)
      .filter((id) => id && !accounts.some((a) => a.Account_uuid === id));

    console.log(`\nAccounts checked : ${accounts.length}`);
    console.log(`Out of sync      : ${drifted.length}`);

    if (drifted.length) {
      console.log("\n  account                                   stored →   expected      delta");
      console.log("  " + "-".repeat(76));
      for (const d of drifted) {
        console.log(
          `  ${String(d.name || d.uuid).slice(0, 38).padEnd(38)} ${String(d.stored).padStart(12)} → ${String(d.expected).padStart(12)} ${String(d.delta).padStart(10)}`
        );
      }
    }

    if (orphans.length) {
      console.log(`\nJournal account ids with no Accounts row (not reconciled): ${orphans.length}`);
    }

    if (!drifted.length) {
      console.log("\n✅ Every account balance matches the journal.");
    } else if (!APPLY) {
      console.log("\nDry run — nothing written. Re-run with --apply to correct these balances.");
    } else {
      await Accounts.bulkWrite(
        drifted.map((d) => ({
          updateOne: {
            filter: { Account_uuid: d.uuid },
            update: { $set: { Balance: d.expected, Updated_at: new Date() } },
          },
        })),
        { ordered: false }
      );
      console.log(`\n✅ Corrected ${drifted.length} account balance(s) from the journal.`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Reconciliation failed:", err.message);
    process.exit(1);
  }
})();
