const DAY_MS = 24 * 60 * 60 * 1000;
const INDIA_OFFSET = '+05:30';

function endExclusiveForIndiaDate(asOf) {
  if (asOf == null || String(asOf).trim() === '') return null;
  const value = String(asOf).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error('asOf must be a date in YYYY-MM-DD format'), { statusCode: 400 });
  }
  const [year, month, day] = value.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error('asOf must be a valid calendar date'), { statusCode: 400 });
  }
  return new Date(Date.parse(value + 'T00:00:00' + INDIA_OFFSET) + DAY_MS);
}

function buildBalancePipeline(endExclusive) {
  const pipeline = [];
  if (endExclusive) pipeline.push({ $match: { Transaction_date: { $lt: endExclusive } } });
  pipeline.push(
    { $unwind: '$Journal_entry' },
    {
      $group: {
        _id: '$Journal_entry.Account_id',
        debit: {
          $sum: {
            $cond: [
              { $eq: ['$Journal_entry.Type', 'Debit'] },
              { $ifNull: ['$Journal_entry.Amount', 0] },
              0,
            ],
          },
        },
        credit: {
          $sum: {
            $cond: [
              { $eq: ['$Journal_entry.Type', 'Credit'] },
              { $ifNull: ['$Journal_entry.Amount', 0] },
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        accountId: '$_id',
        debit: 1,
        credit: 1,
      },
    }
  );
  return pipeline;
}

const dateCountsPipeline = [
  {
    $group: {
      _id: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: '$Transaction_date',
          timezone: 'Asia/Kolkata',
        },
      },
      count: { $sum: 1 },
    },
  },
  { $sort: { _id: -1 } },
];

async function getOutstandingSummary(Transaction, asOf) {
  const endExclusive = endExclusiveForIndiaDate(asOf);
  const [balances, dateCounts, allCount] = await Promise.all([
    Transaction.aggregate(buildBalancePipeline(endExclusive)).exec(),
    Transaction.aggregate(dateCountsPipeline).exec(),
    Transaction.countDocuments({}),
  ]);
  const dateCountMap = Object.fromEntries(dateCounts.map(({ _id, count }) => [_id, count]));
  return {
    balances,
    availableDates: dateCounts.map(({ _id }) => _id),
    dateCountMap,
    allCount,
  };
}

module.exports = {
  endExclusiveForIndiaDate,
  buildBalancePipeline,
  dateCountsPipeline,
  getOutstandingSummary,
};
