// Guards on the one route in Usertask.js that can spend the business's
// WhatsApp account.
//
// POST /api/usertasks/send-message takes a number and a body from the caller
// and sends it. It has always required a token (router.use(requireAuth)), but
// nothing beyond that: no send cap, no check that the "number" was a number,
// no 24-hour customer-service-window check, and the provider's raw reply was
// handed straight back to the browser. These cover each of those.
//
// The repositories and the send path are mocked so this runs without a mongod
// or a live WhatsApp account; every assertion below lands in the route's own
// validation or in middleware, before any query or outbound call.

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.ACCESS_TOKEN_SECRET = 'test-secret-not-a-real-key';

const mockSendWhatsAppText = jest.fn(async () => ({
  messages: [{ id: 'wamid.INTERNAL' }],
  account: { phone_number_id: '1234567890' },
}));

jest.mock('../../src/services/unifiedWhatsAppService', () => ({ sendWhatsAppText: mockSendWhatsAppText }));
jest.mock('../../src/repositories/usertask', () => ({
  findOne: jest.fn(async () => null),
  find: jest.fn(() => ({ lean: async () => [] })),
}));
jest.mock('../../src/repositories/counter', () => ({
  findOneAndUpdate: jest.fn(async () => ({ seq: 1 })),
}));

// The 24-hour window guard looks up the last inbound message from this
// contact. `mockLastIncoming` is what it finds; null means the customer has never
// written, which is the closed-window case.
let mockLastIncoming = null;
jest.mock('../../src/repositories/Message', () => ({
  findOne: jest.fn(() => ({
    sort: () => ({ lean: async () => mockLastIncoming }),
  })),
}));

// The limiter is deliberately NOT mocked here — its 30/minute cap is one of
// the things under test.
const usertaskRouter = require('../../src/routes/Usertask');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/usertasks', usertaskRouter);
app.use(errorHandler);

// requireAuth resolves the account behind the token; a live row is stubbed so
// these requests reach the route rather than stopping at 401.
jest.mock('../../src/repositories/users');
const Users = require('../../src/repositories/users');
// Echo back whichever id was asked for: the rate-limit case below relies on two
// tokens resolving to two different callers.
Users.findById.mockImplementation((id) => ({
  select: () => ({
    lean: async () => ({
      _id: id, User_name: 'tester', User_group: 'Office User', Session_version: 0,
      permissions: {},
    }),
  }),
}));

const TOKEN = jwt.sign({ id: 'u-1', userName: 'tester', sv: 0 }, process.env.ACCESS_TOKEN_SECRET);
const post = (body) =>
  request(app).post('/api/usertasks/send-message').set('Authorization', `Bearer ${TOKEN}`).send(body);

const VALID = { mobile: '9876543210', message: 'hello' };

beforeEach(() => {
  mockSendWhatsAppText.mockClear();
  // Default to an open window; the window cases below set their own.
  mockLastIncoming = { timestamp: new Date() };
});

describe('POST /api/usertasks/send-message', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).post('/api/usertasks/send-message').send(VALID);

    expect(res.status).toBe(401);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric mobile rather than sending to the bare country code', async () => {
    // normalizeWhatsAppNumber turns 'abc' into '91', which the provider would
    // have accepted as a recipient.
    const res = await post({ ...VALID, mobile: 'abc' });

    expect(res.status).toBe(400);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('rejects a mobile that is too short to be a real number', async () => {
    const res = await post({ ...VALID, mobile: '98765' });

    expect(res.status).toBe(400);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('rejects a body longer than WhatsApp accepts', async () => {
    const res = await post({ ...VALID, message: 'x'.repeat(4097) });

    expect(res.status).toBe(400);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('sends a valid request and returns no provider detail', async () => {
    const res = await post(VALID);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(JSON.stringify(res.body)).not.toContain('wamid.INTERNAL');
    expect(mockSendWhatsAppText).toHaveBeenCalledWith(
      expect.objectContaining({ to: '919876543210', body: 'hello' })
    );
  });

  it('refuses free text when the customer has not written in 24 hours', async () => {
    mockLastIncoming = { timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000) };

    const res = await post(VALID);

    expect(res.status).toBe(403);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('refuses free text when the customer has never written', async () => {
    mockLastIncoming = null;

    const res = await post(VALID);

    expect(res.status).toBe(403);
    expect(mockSendWhatsAppText).not.toHaveBeenCalled();
  });

  it('allows the send inside the 24-hour window', async () => {
    mockLastIncoming = { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) };

    const res = await post(VALID);

    expect(res.status).toBe(200);
    expect(mockSendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it('caps one caller at 30 sends per minute', async () => {
    // A token of its own: the limiter keys on user id + path, so reusing the
    // shared one would start this test partway through the window the
    // preceding cases already spent.
    const burstToken = jwt.sign({ id: 'u-burst', userName: 'burst', sv: 0 }, process.env.ACCESS_TOKEN_SECRET);
    const burstPost = () =>
      request(app)
        .post('/api/usertasks/send-message')
        .set('Authorization', `Bearer ${burstToken}`)
        .send(VALID);

    const statuses = [];
    for (let i = 0; i < 32; i += 1) {
      // Sequential on purpose: the limiter counts requests, and a parallel
      // burst would make "the 31st" ambiguous.
      statuses.push((await burstPost()).status); // eslint-disable-line no-await-in-loop
    }

    expect(statuses.filter((status) => status === 200)).toHaveLength(30);
    expect(statuses.filter((status) => status === 429)).toHaveLength(2);
    expect(mockSendWhatsAppText).toHaveBeenCalledTimes(30);
  });
});
