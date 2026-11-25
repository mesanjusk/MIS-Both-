const express = require('express');
const request = require('supertest');
const EmailHistory = require('../../src/repositories/EmailHistory');
const { AppSetting } = require('../../src/repositories/appSetting');
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
  jest.spyOn(AppSetting, 'find').mockReturnValue({ select: () => ({ lean: async () => [] }) });
  const response = await request(app).get('/print-sent/folders?status=pending');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ dates: ['2020-01-01'], folders });
  expect(aggregate.mock.calls[0][0][0].$match).toEqual({
    source: 'print_sent', attachments: { $elemMatch: { received: { $ne: true } } },
  });
});

test('lists saved aliases for all synced recipients and uses aliases in folders', async () => {
  const email = 'print@example.com';
  const key = `print_sent_recipient_alias:${email}`;
  const folders = [{ date: '2020-01-01', email, name: 'Mail name', count: 1 }];
  jest.spyOn(EmailHistory, 'aggregate').mockResolvedValue(folders);
  jest.spyOn(EmailHistory, 'distinct').mockResolvedValue([email, 'other@example.com']);
  jest.spyOn(EmailHistory, 'exists').mockResolvedValue({ _id: 'found' });
  jest.spyOn(AppSetting, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ key, value: 'Gondia Press' }] }) });
  const save = jest.spyOn(AppSetting, 'upsertSetting').mockResolvedValue({});
  const remove = jest.spyOn(AppSetting, 'deleteOne').mockResolvedValue({});

  expect((await request(app).get('/print-sent/recipients')).body.result).toEqual([
    { email: 'other@example.com', alias: '' }, { email, alias: 'Gondia Press' },
  ]);
  expect((await request(app).get('/print-sent/folders?status=pending')).body.folders).toEqual([
    { ...folders[0], alias: 'Gondia Press' },
  ]);
  const url = '/print-sent/recipients';
  expect((await request(app).patch(url).set('x-test-role', 'worker').send({ email, alias: 'Wrong' })).status).toBe(403);
  expect((await request(app).patch(url).send({ email, alias: ' New name ' })).body).toEqual({ email, alias: 'New name' });
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ key, value: 'New name' }));
  expect((await request(app).patch(url).send({ email, alias: '' })).status).toBe(200);
  expect(remove).toHaveBeenCalledWith({ key });
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

test('bulk receipt marks only pending attachments within the selected IST period', async () => {
  const update = jest.spyOn(EmailHistory, 'updateMany').mockResolvedValue({ modifiedCount: 4 });
  const url = '/print-sent/bulk-receive';
  expect((await request(app).patch(url).send({ date: '2020-01-03', period: 'week' })).status).toBe(400);
  expect((await request(app).patch(url).set('x-test-role', 'customer').send({ date: '2020-01-01', period: 'month' })).status).toBe(403);
  const response = await request(app).patch(url).send({ date: '2020-01-01', period: 'month' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ updatedEmails: 4 });
  expect(update).toHaveBeenCalledWith({
    source: 'print_sent',
    sentAt: { $gte: new Date('2019-12-31T18:30:00Z'), $lt: new Date('2020-01-31T18:30:00Z') },
    attachments: { $elemMatch: { received: { $ne: true } } },
  }, { $set: { 'attachments.$[attachment].received': true } }, {
    arrayFilters: [{ 'attachment.received': { $ne: true } }],
  });
  expect(update).toHaveBeenCalledTimes(1);
});
