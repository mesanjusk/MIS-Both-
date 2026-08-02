require('../helpers/mongoSetup');
const Message = require('../../src/repositories/Message');
const { enforceWhatsApp24hWindow } = require('../../src/middleware/whatsapp24hGuard');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const runGuard = (req) =>
  new Promise((resolve, reject) => {
    const res = mockRes();
    const next = jest.fn((err) => (err ? reject(err) : resolve({ req, res, next })));
    // enforceWhatsApp24hWindow only calls next() on success/passthrough; on a
    // 403 block it never calls next at all, so resolve from res.json too.
    const originalJson = res.json;
    res.json = jest.fn((body) => {
      originalJson(body);
      resolve({ req, res, next, blocked: true });
      return res;
    });
    enforceWhatsApp24hWindow(req, res, next).catch(reject);
  });

describe('whatsapp24hGuard.enforceWhatsApp24hWindow', () => {
  test('passes through untouched when the request is not a recognized send type', async () => {
    const req = { path: '/whatsapp/other', body: {} };
    const { blocked, next } = await runGuard(req);
    expect(blocked).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  test('allows a free-form text send when the customer messaged within the last 24h', async () => {
    await Message.create({ from: '919876543210', direction: 'incoming', fromMe: false, timestamp: new Date() });
    const req = { path: '/whatsapp/send-text', body: { to: '919876543210', type: 'text' } };
    const { blocked, req: finishedReq } = await runGuard(req);
    expect(blocked).toBeUndefined();
    expect(finishedReq.whatsapp24hWindow.isInsideWindow).toBe(true);
  });

  test('blocks a free-form text send when the last incoming message is older than 24h', async () => {
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30h ago
    await Message.create({ from: '919876543211', direction: 'incoming', fromMe: false, timestamp: oldDate });
    const req = { path: '/whatsapp/send-text', body: { to: '919876543211', type: 'text' } };
    const { blocked, res } = await runGuard(req);
    expect(blocked).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('blocks when there is no incoming message on record at all', async () => {
    const req = { path: '/whatsapp/send-text', body: { to: '919999999999', type: 'text' } };
    const { blocked, res } = await runGuard(req);
    expect(blocked).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('always allows a template send, even outside the 24h window', async () => {
    const req = { path: '/whatsapp/send-template', body: { to: '919999999998' } };
    const { blocked, next } = await runGuard(req);
    expect(blocked).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  test('matches on contactId/customerUuid when the phone number is not directly on the request', async () => {
    await Message.create({ customerUuid: 'cust-abc', direction: 'incoming', fromMe: false, timestamp: new Date() });
    const req = { path: '/whatsapp/send-text', body: { contactId: 'cust-abc', type: 'text' } };
    const { blocked } = await runGuard(req);
    expect(blocked).toBeUndefined();
  });

  test('skips enforcement when no identity can be resolved from the request at all', async () => {
    const req = { path: '/whatsapp/send-text', body: { type: 'text' } };
    const { blocked, next } = await runGuard(req);
    expect(blocked).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
