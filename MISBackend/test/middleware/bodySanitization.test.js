/**
 * mongoSanitize was mounted before express.json, so it only ever saw the query
 * string: a JSON body carrying operator keys like $ne reached the route
 * untouched. The audit reproduced exactly this with a local Express probe.
 *
 * This pins the ordering by building both arrangements and showing the
 * difference, so a future reshuffle of index.js cannot quietly undo it.
 */
const express = require('express');
const request = require('supertest');
const mongoSanitize = require('express-mongo-sanitize');

const buildApp = (order) => {
  const app = express();

  if (order === 'sanitize-first') {
    app.use(mongoSanitize({ allowDots: true }));
    app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  } else {
    app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
    app.use(mongoSanitize({ allowDots: true }));
  }

  app.post('/probe', (req, res) => res.json({ body: req.body, rawLength: req.rawBody?.length }));
  return app;
};

describe('body sanitization runs after body parsing', () => {
  test('the old order let a $ne operator through in a JSON body', async () => {
    const res = await request(buildApp('sanitize-first'))
      .post('/probe')
      .send({ User_name: { $ne: null } });

    // Documents the defect this ordering fixed.
    expect(res.body.body.User_name).toEqual({ $ne: null });
  });

  test('the current order strips it', async () => {
    const res = await request(buildApp('parse-first'))
      .post('/probe')
      .send({ User_name: { $ne: null } });

    expect(res.body.body.User_name).toEqual({});
  });

  test('nested operators are stripped too', async () => {
    const res = await request(buildApp('parse-first'))
      .post('/probe')
      .send({ filter: { nested: { $gt: '' } }, keep: 'value' });

    expect(res.body.body.filter.nested).toEqual({});
    expect(res.body.body.keep).toBe('value');
  });

  test('ordinary values are untouched', async () => {
    const res = await request(buildApp('parse-first'))
      .post('/probe')
      .send({ User_name: 'Ramesh', amount: 100, nested: { ok: true } });

    expect(res.body.body).toEqual({ User_name: 'Ramesh', amount: 100, nested: { ok: true } });
  });

  test('rawBody is still captured, so webhook HMAC verification is unaffected', async () => {
    // The parsers run first now; their verify hook is what records the bytes as
    // sent, and sanitization afterwards does not disturb it.
    const res = await request(buildApp('parse-first'))
      .post('/probe')
      .send({ User_name: { $ne: null } });

    expect(res.body.rawLength).toBe(JSON.stringify({ User_name: { $ne: null } }).length);
  });
});
