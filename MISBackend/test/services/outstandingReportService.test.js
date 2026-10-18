const {
  endExclusiveForIndiaDate,
  buildBalancePipeline,
  getOutstandingSummary,
} = require('../../src/services/outstandingReportService');

describe('outstanding report summary', () => {
  test('uses midnight India time after the selected date as an exclusive cutoff', () => {
    expect(endExclusiveForIndiaDate('2026-10-18').toISOString()).toBe('2026-10-18T18:30:00.000Z');
  });

  test('rejects malformed or impossible selected dates', () => {
    expect(() => endExclusiveForIndiaDate('18-10-2026')).toThrow(/YYYY-MM-DD/);
    expect(() => endExclusiveForIndiaDate('2026-02-30')).toThrow(/valid calendar date/);
  });

  test('aggregates debit and credit by account instead of returning transaction rows', () => {
    const pipeline = buildBalancePipeline(endExclusiveForIndiaDate('2026-10-18'));
    expect(pipeline[0]).toEqual({
      $match: { Transaction_date: { $lt: new Date('2026-10-18T18:30:00.000Z') } },
    });
    expect(pipeline[1]).toEqual({ $unwind: '$Journal_entry' });
    expect(pipeline[2].$group._id).toBe('$Journal_entry.Account_id');
    expect(pipeline[2].$group.debit.$sum.$cond[0]).toEqual({ $eq: ['$Journal_entry.Type', 'Debit'] });
    expect(pipeline[2].$group.credit.$sum.$cond[0]).toEqual({ $eq: ['$Journal_entry.Type', 'Credit'] });
    expect(pipeline.some((stage) => stage.$limit)).toBe(false);
  });

  test('returns compact balances, date counts, and transaction count', async () => {
    const rows = [
      [{ accountId: 'customer-1', debit: 500, credit: 100 }],
      [{ _id: '2026-10-18', count: 8 }, { _id: '2026-10-17', count: 4 }],
    ];
    let call = 0;
    const Transaction = {
      aggregate: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(rows[call++]) })),
      countDocuments: jest.fn().mockResolvedValue(12),
    };

    await expect(getOutstandingSummary(Transaction, '2026-10-18')).resolves.toEqual({
      balances: [{ accountId: 'customer-1', debit: 500, credit: 100 }],
      availableDates: ['2026-10-18', '2026-10-17'],
      dateCountMap: { '2026-10-18': 8, '2026-10-17': 4 },
      allCount: 12,
    });
    expect(Transaction.aggregate).toHaveBeenCalledTimes(2);
    expect(Transaction.countDocuments).toHaveBeenCalledWith({});
  });

  test('an empty date includes all available history', () => {
    expect(buildBalancePipeline(endExclusiveForIndiaDate(''))[0]).toEqual({ $unwind: '$Journal_entry' });
  });
});
