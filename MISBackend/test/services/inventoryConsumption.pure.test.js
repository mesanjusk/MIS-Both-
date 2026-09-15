/**
 * consumeWorkRow read the remaining quantity and then incremented it without
 * putting what it had read into the update predicate, so two concurrent
 * requests could both pass the check and consume past what the row required.
 * The order was also updated before the stock movement was written, leaving
 * consumption recorded with no matching movement when the second write failed.
 *
 * Persistence is mocked, so these run without a MongoDB server.
 */
jest.mock('../../src/repositories/order');
jest.mock('../../src/repositories/items');
jest.mock('../../src/repositories/stockMovement');

const Orders        = require('../../src/repositories/order');
const StockMovement = require('../../src/repositories/stockMovement');
const { consumeWorkRow } = require('../../src/services/inventoryService');

const ORDER_UUID = 'order-1';
const ROW_ID     = 'row-1';

/**
 * A stand-in order collection that enforces the predicate the way MongoDB
 * would, so a stale claim genuinely fails to match.
 */
const makeStore = (consumedQty = 0, requiredQty = 10) => {
  const state = { consumedQty, requiredQty, status: 'in_progress' };

  Orders.findOne.mockImplementation(() => ({
    lean: async () => ({
      Order_uuid: ORDER_UUID,
      Order_Number: 42,
      workRows: [{
        workRowId: ROW_ID,
        itemUuid: 'item-1',
        itemName: 'Vinyl',
        requiredQty: state.requiredQty,
        consumedQty: state.consumedQty,
        status: state.status,
      }],
    }),
  }));

  Orders.updateOne.mockImplementation(async (filter, update) => {
    const expected = filter.workRows?.$elemMatch?.consumedQty;
    if (expected !== undefined) {
      const wanted = expected && expected.$in ? expected.$in : [expected];
      // The claim only lands while consumedQty is still what was read.
      if (!wanted.includes(state.consumedQty)) return { matchedCount: 0 };
    }
    state.consumedQty += update.$inc['workRows.$.consumedQty'];
    if (update.$set) state.status = update.$set['workRows.$.status'];
    return { matchedCount: 1 };
  });

  return state;
};

beforeEach(() => {
  jest.clearAllMocks();
  StockMovement.create.mockResolvedValue({});
});

describe('consumeWorkRow claims the quantity atomically', () => {
  test('consumes and records a matching stock movement', async () => {
    const state = makeStore(0, 10);
    await consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 4 });

    expect(state.consumedQty).toBe(4);
    expect(StockMovement.create).toHaveBeenCalledTimes(1);
    expect(StockMovement.create.mock.calls[0][0]).toMatchObject({ qty_out: 4, reference_id: ROW_ID });
  });

  test('the update is predicated on the quantity that was read', async () => {
    makeStore(3, 10);
    await consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 2 });

    const [filter] = Orders.updateOne.mock.calls[0];
    expect(filter.workRows.$elemMatch).toMatchObject({ workRowId: ROW_ID, consumedQty: 3 });
  });

  test('treats a row written before consumedQty existed as zero-consumed', async () => {
    makeStore(0, 10);
    await consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 1 });

    const [filter] = Orders.updateOne.mock.calls[0];
    // null matches both a missing field and an explicit null.
    expect(filter.workRows.$elemMatch.consumedQty).toEqual({ $in: [0, null] });
  });

  test('marks the row done once the required quantity is reached', async () => {
    const state = makeStore(8, 10);
    await consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 2 });
    expect(state.status).toBe('done');
  });

  test('two consumptions cannot exceed the required quantity', async () => {
    const state = makeStore(0, 10);
    await consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 7 });

    // The second re-reads after the first landed and is refused against the
    // quantity that actually remains.
    await expect(
      consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 7 })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(state.consumedQty).toBe(7);
  });

  test('a losing claim re-reads and succeeds when there is still room', async () => {
    const state = makeStore(0, 10);
    let firstCall = true;

    const realUpdate = Orders.updateOne.getMockImplementation();
    Orders.updateOne.mockImplementation(async (filter, update) => {
      if (firstCall) {
        firstCall = false;
        // Someone else consumed 2 between the read and this write.
        state.consumedQty += 2;
        return { matchedCount: 0 };
      }
      return realUpdate(filter, update);
    });

    await consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 3 });
    expect(state.consumedQty).toBe(5);
    expect(Orders.updateOne).toHaveBeenCalledTimes(2);
  });

  test('gives up with a conflict rather than spinning', async () => {
    makeStore(0, 100);
    Orders.updateOne.mockResolvedValue({ matchedCount: 0 });

    await expect(
      consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 1 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('consumeWorkRow does not leave partial records', () => {
  test('returns the quantity when the stock movement fails', async () => {
    const state = makeStore(0, 10);
    StockMovement.create.mockRejectedValue(new Error('write failed'));

    await expect(
      consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty: 4 })
    ).rejects.toThrow('write failed');

    // Rolled back: consumption is not recorded without its movement.
    expect(state.consumedQty).toBe(0);
  });
});

describe('consumeWorkRow input validation', () => {
  test.each([0, -1, NaN, 'abc'])('rejects a qty of %p', async (qty) => {
    makeStore(0, 10);
    await expect(
      consumeWorkRow({ orderId: ORDER_UUID, workRowId: ROW_ID, qty })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects an unknown work row', async () => {
    makeStore(0, 10);
    await expect(
      consumeWorkRow({ orderId: ORDER_UUID, workRowId: 'nope', qty: 1 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
