const express = require('express');
const request = require('supertest');
const EmailHistory = require('../../src/repositories/EmailHistory');
const gmailRouter = require('../../src/routes/Gmail');

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { userGroup: req.get('x-test-role') || 'owner' };
    next();
  },
}));

const app = express();
app.use(express.json(), gmailRouter);
app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));

afterEach(() => jest.restoreAllMocks());

test('keeps older pending folders and includes legacy attachments with no receipt flag', async () => {
  const folders = [{ date: '2020-01-01', email: 'print@example.com', name: 'Press', count: 1 }];
  const aggregate = jest.spyOn(EmailHistory, 'aggregate').mockResolvedValue(folders);
  const response = await request(app).get('/print-sent/folders?status=pending');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ dates: ['2020-01-01'], folders });
  expect(aggregate.mock.calls[0][0][0].$match).toEqual({
    source: 'print_sent', attachments: { $elemMatch: { received: { $ne: true } } },
  });
});

test('checks and unchecks one attachment on a Print Sent email', async () => {
  const id = '507f1f77bcf86cd799439011';
  const url = `/print-sent/messages/${id}/attachments/1`;
  const update = jest.spyOn(EmailHistory, 'updateOne').mockResolvedValue({ matchedCount: 1 });
  for (const received of [true, false]) {
    const response = await request(app).patch(url).send({ received });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received });
    expect(update).toHaveBeenLastCalledWith(
      { _id: id, source: 'print_sent', 'attachments.1': { $exists: true } },
      { $set: { 'attachments.1.received': received } },
    );
  }
  expect((await request(app).patch(url).send({ received: 'false' })).status).toBe(400);
  expect((await request(app).patch(url).set('x-test-role', 'customer').send({ received: true })).status).toBe(403);
  expect(update).toHaveBeenCalledTimes(2);
});
