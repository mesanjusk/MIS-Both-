const Counter = require('../repositories/counter');
const Attendance = require('../repositories/attendance');

const COUNTER_ID = 'attendance_record_number';
let seedPromise = null;

function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const highest = await Attendance.findOne()
        .sort({ Attendance_Record_ID: -1 })
        .select('Attendance_Record_ID')
        .lean();

      const max = Number(highest?.Attendance_Record_ID || 0);
      if (max > 0) {
        await Counter.updateOne(
          { _id: COUNTER_ID },
          { $max: { seq: max } },
          { upsert: true }
        );
      }
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function allocate() {
  await ensureSeeded();
  const counter = await Counter.findByIdAndUpdate(
    COUNTER_ID,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return Number(counter?.seq || 1);
}

function _resetSeedCache() {
  seedPromise = null;
}

module.exports = { allocate, ensureSeeded, COUNTER_ID, _resetSeedCache };
