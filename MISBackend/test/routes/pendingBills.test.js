const express = require('express');
const request = require('supertest');
const Orders = require('../../src/repositories/order');
const router = require('../../src/routes/Order/queriesRouter');

const app = express();
app.use(router);

afterEach(() => jest.restoreAllMocks());

describe('GET /GetPendingBills', () => {
  test('returns only unbilled delivered orders, with offset pagination', async () => {
    const order = { _id: '123', Order_uuid: 'uuid-1', Order_Number: 12, Customer_name: 'Buyer' };
    const aggregate = jest.spyOn(Orders, 'aggregate').mockResolvedValue([{
      rows: [order],
      metadata: [{ total: 15 }],
    }]);

    const response = await request(app).get('/GetPendingBills?offset=10&limit=3');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true, result: [order], total: 15, offset: 10, hasMore: true,
    });

    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.$or).toEqual(expect.arrayContaining([
      { stage: { $in: ['delivered', 'paid'] } },
    ]));
    expect(pipeline.some((stage) => stage.$match?.hasBillable === false)).toBe(true);
    const facet = pipeline.find((stage) => stage.$facet).$facet;
    expect(facet.rows).toEqual(expect.arrayContaining([{ $skip: 10 }, { $limit: 3 }]));
    expect(facet.metadata).toEqual([{ $count: 'total' }]);
  });

  test('caps page size and does not expose server error details', async () => {
    const aggregate = jest.spyOn(Orders, 'aggregate').mockRejectedValue(new Error('Internal DB secret'));
    const response = await request(app).get('/GetPendingBills?limit=50000');
    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Unable to load pending bills');
    const facet = aggregate.mock.calls[0][0].find((stage) => stage.$facet).$facet;
    expect(facet.rows).toContainEqual({ $limit: 200 });
  });
});
