/**
 * Two scheduling defects from the audit:
 *
 *   - the message scheduler polled every five seconds and selected due rows
 *     with no claim at all, so a send lasting longer than one poll was picked
 *     up again by the next and delivered twice;
 *   - daily jobs kept every marker in one settings object that was loaded
 *     whole, mutated and written back whole, so overlapping saves from their
 *     separate timers overwrote one another's markers.
 */
jest.mock('../../src/repositories/ScheduledMessage');
jest.mock('../../src/services/unifiedWhatsAppService', () => ({
  sendWhatsAppText: jest.fn().mockResolvedValue({ ok: true }),
}));

const ScheduledMessage = require('../../src/repositories/ScheduledMessage');
const { sendWhatsAppText } = require('../../src/services/unifiedWhatsAppService');
const { processScheduledMessages } = require('../../src/services/messageScheduler');

/** A queue of rows claimDueMessage will hand out, one per call. */
const queueRows = (rows) => {
  const pending = rows.map((r) => ({
    status: 'sending', attempts: 0, save: jest.fn().mockResolvedValue(undefined), ...r,
  }));
  ScheduledMessage.findOneAndUpdate.mockImplementation(async () => pending.shift() || null);
  return pending;
};

beforeEach(() => {
  jest.clearAllMocks();
  sendWhatsAppText.mockResolvedValue({ ok: true });
});

describe('the message scheduler claims a row before sending it', () => {
  test('selection and claim are one atomic update', async () => {
    queueRows([{ _id: 'm1', to: '91999', message: 'hi' }]);

    await processScheduledMessages();

    const [filter, update, options] = ScheduledMessage.findOneAndUpdate.mock.calls[0];
    expect(filter.sendAt.$lte).toBeInstanceOf(Date);
    // Claimed as 'sending' in the same operation that selected it, so a second
    // poll cannot pick up the same row.
    expect(update.$set.status).toBe('sending');
    expect(update.$set.leaseUntil).toBeInstanceOf(Date);
    expect(options.sort).toEqual({ sendAt: 1 });
  });

  test('only rows that are unclaimed, or whose lease lapsed, are eligible', async () => {
    queueRows([]);
    await processScheduledMessages();

    const [filter] = ScheduledMessage.findOneAndUpdate.mock.calls[0];
    expect(filter.$or).toEqual([
      { status: 'scheduled' },
      { status: 'sending', leaseUntil: { $lt: expect.any(Date) } },
    ]);
  });

  test('sends each claimed row exactly once and marks it sent', async () => {
    const rows = queueRows([
      { _id: 'm1', to: '91111', message: 'one' },
      { _id: 'm2', to: '92222', message: 'two' },
    ]);

    await processScheduledMessages();

    expect(sendWhatsAppText).toHaveBeenCalledTimes(2);
    expect(rows.every((r) => r.status === 'sent')).toBe(true);
  });

  test('a failed send is marked failed and its reason kept', async () => {
    const [row] = queueRows([{ _id: 'm1', to: '91111', message: 'one' }]);
    sendWhatsAppText.mockRejectedValue(new Error('provider refused'));

    await processScheduledMessages();

    expect(row.status).toBe('failed');
    expect(row.lastError).toMatch(/provider refused/);
    expect(row.attempts).toBe(1);
  });

  test('releases the lease once the row is settled', async () => {
    const [row] = queueRows([{ _id: 'm1', to: '91111', message: 'one', leaseUntil: new Date() }]);
    await processScheduledMessages();
    expect(row.leaseUntil).toBeNull();
  });

  test('a slow batch does not have the next tick start a second pass', async () => {
    // A poll already in flight returns immediately rather than claiming again.
    queueRows([{ _id: 'm1', to: '91111', message: 'one' }]);
    let release;
    sendWhatsAppText.mockImplementation(() => new Promise((r) => { release = r; }));

    const first = processScheduledMessages();
    // Let the first poll reach its send before the overlapping tick fires.
    await new Promise((r) => setImmediate(r));

    await processScheduledMessages();       // the overlapping tick
    release({ ok: true });
    await first;

    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  test('a claim failure does not throw out of the poll', async () => {
    ScheduledMessage.findOneAndUpdate.mockRejectedValue(new Error('database down'));
    await expect(processScheduledMessages()).resolves.toBeUndefined();
  });
});
