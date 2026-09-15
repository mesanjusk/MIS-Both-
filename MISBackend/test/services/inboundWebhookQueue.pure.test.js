/**
 * The WhatsApp webhook verified the signature, answered 200, and only then
 * processed the message. Anything that failed after that 200 — a crash, a
 * database blip, a bug in processing — lost the delivery for good, because the
 * sender had already been told it succeeded.
 *
 * Persistence is mocked, so these run without a MongoDB server.
 */
jest.mock('../../src/repositories/inboundWebhookEvent');

const InboundWebhookEvent = require('../../src/repositories/inboundWebhookEvent');
const queue = require('../../src/services/inboundWebhookQueue');

beforeEach(() => jest.clearAllMocks());

describe('dedupeKeyFor', () => {
  test('uses the provider message id when there is one', () => {
    expect(queue.dedupeKeyFor('metabsp', { a: 1 }, 'wamid.123')).toBe('metabsp:wamid.123');
  });

  test('falls back to a hash of the payload, stable across identical retries', () => {
    const a = queue.dedupeKeyFor('metabsp', { from: '91999', text: 'hi' });
    const b = queue.dedupeKeyFor('metabsp', { from: '91999', text: 'hi' });
    expect(a).toBe(b);
    expect(a).toMatch(/^metabsp:sha256:/);
  });

  test('different payloads get different keys', () => {
    expect(queue.dedupeKeyFor('metabsp', { text: 'hi' }))
      .not.toBe(queue.dedupeKeyFor('metabsp', { text: 'bye' }));
  });
});

describe('record', () => {
  test('stores the delivery as pending before it is processed', async () => {
    InboundWebhookEvent.create.mockResolvedValue({ _id: 'e1' });

    const result = await queue.record({
      provider: 'metabsp', payload: { text: 'hi' }, providerMessageId: 'wamid.1',
    });

    expect(result).toMatchObject({ duplicate: false, recorded: true });
    expect(InboundWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'metabsp', dedupe_key: 'metabsp:wamid.1', status: 'pending' })
    );
  });

  test('a provider retry collapses onto the row already stored', async () => {
    InboundWebhookEvent.create.mockRejectedValue({ code: 11000 });
    InboundWebhookEvent.findOne.mockReturnValue({ lean: async () => ({ _id: 'e1' }) });

    const result = await queue.record({
      provider: 'metabsp', payload: {}, providerMessageId: 'wamid.1',
    });

    expect(result.duplicate).toBe(true);
    expect(result.recorded).toBe(true);
  });

  test('reports failure to record, so the caller can refuse to acknowledge', async () => {
    // This is the one case where answering 200 would lose the delivery.
    InboundWebhookEvent.create.mockRejectedValue(new Error('database down'));

    const result = await queue.record({ provider: 'metabsp', payload: {} });

    expect(result.recorded).toBe(false);
    expect(result.event).toBeNull();
  });
});

describe('claimNext', () => {
  test('claims atomically, taking a lease as it selects', async () => {
    InboundWebhookEvent.findOneAndUpdate.mockReturnValue({ lean: async () => ({ _id: 'e1' }) });

    await queue.claimNext('metabsp');

    const [filter, update, options] = InboundWebhookEvent.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ provider: 'metabsp', status: 'pending' });
    expect(update.$set.status).toBe('processing');
    expect(update.$set.lease_until).toBeInstanceOf(Date);
    // Oldest first, so a backlog drains in order.
    expect(options.sort).toEqual({ createdAt: 1 });
  });

  test('a row whose lease has lapsed is claimable again', async () => {
    InboundWebhookEvent.findOneAndUpdate.mockReturnValue({ lean: async () => null });
    await queue.claimNext('metabsp');

    const [filter] = InboundWebhookEvent.findOneAndUpdate.mock.calls[0];
    expect(filter.$or).toEqual([
      { lease_until: null },
      { lease_until: { $lt: expect.any(Date) } },
    ]);
  });
});

describe('drain', () => {
  const queueOf = (rows) => {
    const pending = [...rows];
    InboundWebhookEvent.findOneAndUpdate.mockImplementation(() => ({
      lean: async () => pending.shift() || null,
    }));
    InboundWebhookEvent.updateOne.mockResolvedValue({});
    InboundWebhookEvent.findById.mockReturnValue({ lean: async () => ({ attempts: 0 }) });
  };

  test('re-runs each recorded delivery through the handler', async () => {
    queueOf([{ _id: 'e1', payload: { n: 1 } }, { _id: 'e2', payload: { n: 2 } }]);
    const handler = jest.fn().mockResolvedValue(undefined);

    const processed = await queue.drain('metabsp', handler);

    expect(processed).toBe(2);
    expect(handler).toHaveBeenCalledWith({ n: 1 });
    expect(handler).toHaveBeenCalledWith({ n: 2 });
  });

  test('marks a delivery done once the handler succeeds', async () => {
    queueOf([{ _id: 'e1', payload: {} }]);
    await queue.drain('metabsp', jest.fn().mockResolvedValue(undefined));

    const doneCall = InboundWebhookEvent.updateOne.mock.calls
      .find(([, update]) => update.$set?.status === 'done');
    expect(doneCall).toBeDefined();
  });

  test('a failing delivery is left to be retried rather than dropped', async () => {
    queueOf([{ _id: 'e1', payload: {} }]);
    await queue.drain('metabsp', jest.fn().mockRejectedValue(new Error('still broken')));

    const [, update] = InboundWebhookEvent.updateOne.mock.calls.at(-1);
    expect(update.$set.status).toBe('pending');
    expect(update.$set.last_error).toMatch(/still broken/);
    expect(update.$inc.attempts).toBe(1);
  });

  test('gives up after the attempt limit instead of retrying forever', async () => {
    queueOf([{ _id: 'e1', payload: {} }]);
    InboundWebhookEvent.findById.mockReturnValue({
      lean: async () => ({ attempts: queue.MAX_ATTEMPTS - 1 }),
    });

    await queue.drain('metabsp', jest.fn().mockRejectedValue(new Error('permanent')));

    const [, update] = InboundWebhookEvent.updateOne.mock.calls.at(-1);
    expect(update.$set.status).toBe('failed');
  });

  test('stops when there is nothing left to claim', async () => {
    queueOf([]);
    const handler = jest.fn();
    expect(await queue.drain('metabsp', handler)).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});
