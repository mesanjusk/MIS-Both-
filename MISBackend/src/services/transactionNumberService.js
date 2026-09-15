/**
 * transactionNumberService.js
 *
 * The single allocator for Transaction_id.
 *
 * Two allocators used to coexist: the manual posting route incremented an
 * atomic Counter document, while accountingPostingService and the opening
 * balance routes read max(Transaction_id) and added one. Those two schemes
 * hand out overlapping numbers, and two concurrent max+1 reads hand out the
 * same number as each other. Every caller now goes through allocate().
 */

const Counter     = require('../repositories/counter');
const Transaction = require('../repositories/transaction');

const COUNTER_ID = 'transaction_number';

let seedPromise = null;

/**
 * Lift the counter above the highest Transaction_id already stored.
 *
 * Rows allocated by the old max+1 scheme can sit above the counter's seq, so
 * incrementing the counter straight away would re-issue numbers those rows
 * already use. $max advances seq only when the stored value is lower, which is
 * safe to run concurrently and is a no-op once the counter leads.
 *
 * Runs once per process; the in-flight promise is shared so parallel callers
 * seed once rather than racing.
 */
function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const highest = await Transaction.findOne()
        .sort({ Transaction_id: -1 })
        .select('Transaction_id')
        .lean();

      const max = Number(highest?.Transaction_id || 0);
      if (max > 0) {
        await Counter.updateOne(
          { _id: COUNTER_ID },
          { $max: { seq: max } },
          { upsert: true }
        );
      }
    })().catch((err) => {
      // Let the next caller retry rather than caching a failed seed.
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

/**
 * Reserve the next Transaction_id. The $inc is atomic, so concurrent callers
 * always receive distinct numbers.
 *
 * @returns {Promise<number>}
 */
async function allocate() {
  await ensureSeeded();

  const counter = await Counter.findByIdAndUpdate(
    COUNTER_ID,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return Number(counter?.seq || 1);
}

/** Test seam — drops the memoized seed so a fresh run re-reads the collection. */
function _resetSeedCache() {
  seedPromise = null;
}

module.exports = { allocate, ensureSeeded, COUNTER_ID, _resetSeedCache };
