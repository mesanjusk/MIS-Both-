/**
 * Inbound webhook retry persistence is stored inside the existing app_settings
 * collection so installations at their MongoDB collection limit do not need a
 * dedicated queue collection.
 *
 * Persistence is mocked, so these tests run without a MongoDB server.
 */
const mockCollection = {
  updateOne: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
};

jest.mock('../../src/repositories/appSetting', () => ({
  AppSetting: { collection: mockCollection },
}));

const queue = require('../../src/services/inboundWebhookQueue');

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockCollection.findOne.mockResolvedValue(null);
  mockCollection.findOneAndUpdate.mockResolvedValue(null);
});

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
  test('stores the delivery as pending inside app_settings', async () => {
    const result = await queue.record({
      provider: 'metabsp', payload: { text: 'hi' }, providerMessageId: 'wamid.1',
    });

    expect(result).toMatchObject({ duplicate: false, recorded: true });

    const recordCall = mockCollection.updateOne.mock.calls.find(([, update]) => update.$push?.['value.events']);
    expect(recordCall).toBeDefined();
    expect(recordCall[0]).toMatchObject({ key: queue.QUEUE_KEY });
    expect(recordCall[1].$push['value.events']).toEqual(expect.objectContaining({
      provider: 'metabsp',
      dedupe_key: 'metabsp:wamid.1',
      status: 'pending',
      attempts: 0,
    }));
  });

  test('a provider retry collapses onto the event already stored', async () => {
    mockCollection.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 }) // ensure queue document
      .mockResolvedValueOnce({ modifiedCount: 0 }) // prune
      .mockResolvedValueOnce({ modifiedCount: 0 }); // duplicate insert guard
    mockCollection.findOne.mockResolvedValue({
      value: { events: [{ _id: 'e1', dedupe_key: 'metabsp:wamid.1' }] },
    });

    const result = await queue.record({
      provider: 'metabsp', payload: {}, providerMessageId: 'wamid.1',
    });

    expect(result.duplicate).toBe(true);
    expect(result.recorded).toBe(true);
    expect(result.event._id).toBe('e1');
  });

  test('reports failure to record, so the caller can refuse to acknowledge', async () => {
    mockCollection.updateOne.mockRejectedValueOnce(new Error('database down'));

    const result = await queue.record({ provider: 'metabsp', payload: {} });

    expect(result.recorded).toBe(false);
    expect(result.event).toBeNull();
  });
});

describe('claimNext', () => {
  test('claims atomically, taking a lease as it selects', async () => {
    mockCollection.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      const leaseToken = update.$set['value.events.$.lease_token'];
      return {
        value: {
          events: [{ _id: 'e1', provider: 'metabsp', payload: {}, lease_token: leaseToken }],
        },
      };
    });

    const event = await queue.claimNext('metabsp');

    expect(event._id).toBe('e1');
    const [filter, update, options] = mockCollection.findOneAndUpdate.mock.calls[0];
    expect(filter.key).toBe(queue.QUEUE_KEY);
    expect(filter['value.events'].$elemMatch.provider).toBe('metabsp');
    expect(update.$set['value.events.$.status']).toBe('processing');
    expect(update.$set['value.events.$.lease_until']).toBeInstanceOf(Date);
    expect(options.returnDocument).toBe('after');
  });

  test('a processing event whose lease has lapsed is claimable again', async () => {
    await queue.claimNext('metabsp');

    const [filter] = mockCollection.findOneAndUpdate.mock.calls[0];
    const alternatives = filter['value.events'].$elemMatch.$or;
    expect(alternatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'processing', lease_until: { $lt: expect.any(Date) } }),
    ]));
  });
});

describe('drain', () => {
  const queueOf = (rows) => {
    const pending = [...rows];
    mockCollection.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      const row = pending.shift();
      if (!row) return null;
      const leaseToken = update.$set['value.events.$.lease_token'];
      return { value: { events: [{ ...row, lease_token: leaseToken }] } };
    });
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

    const doneCall = mockCollection.updateOne.mock.calls.find(([, update]) =>
      update.$set?.['value.events.$[event].status'] === 'done'
    );
    expect(doneCall).toBeDefined();
    expect(doneCall[2].arrayFilters).toEqual([{ 'event._id': 'e1' }]);
  });

  test('a failing delivery is left to be retried rather than dropped', async () => {
    queueOf([{ _id: 'e1', payload: {} }]);
    mockCollection.findOne.mockResolvedValue({ value: { events: [{ _id: 'e1', attempts: 0 }] } });

    await queue.drain('metabsp', jest.fn().mockRejectedValue(new Error('still broken')));

    const failedCall = mockCollection.updateOne.mock.calls.find(([, update]) =>
      update.$set?.['value.events.$[event].last_error']?.includes('still broken')
    );
    expect(failedCall).toBeDefined();
    expect(failedCall[1].$set['value.events.$[event].status']).toBe('pending');
    expect(failedCall[1].$set['value.events.$[event].attempts']).toBe(1);
  });

  test('gives up after the attempt limit instead of retrying forever', async () => {
    queueOf([{ _id: 'e1', payload: {} }]);
    mockCollection.findOne.mockResolvedValue({
      value: { events: [{ _id: 'e1', attempts: queue.MAX_ATTEMPTS - 1 }] },
    });

    await queue.drain('metabsp', jest.fn().mockRejectedValue(new Error('permanent')));

    const failedCall = mockCollection.updateOne.mock.calls.find(([, update]) =>
      update.$set?.['value.events.$[event].last_error']?.includes('permanent')
    );
    expect(failedCall[1].$set['value.events.$[event].status']).toBe('failed');
  });

  test('stops when there is nothing left to claim', async () => {
    queueOf([]);
    const handler = jest.fn();
    expect(await queue.drain('metabsp', handler)).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});
