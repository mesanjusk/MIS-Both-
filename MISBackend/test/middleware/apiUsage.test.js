const { routeKeyOf, _buffer, _reset } = require('../../src/middleware/apiUsage');
const { collectRoutes, groupOf } = require('../../src/utils/routeInventory');
const express = require('express');

afterEach(() => _reset());

describe('routeKeyOf', () => {
  it('uses the route template, not the URL that was requested', () => {
    // The whole point: /api/orders/abc and /api/orders/def are one endpoint.
    // Keying on the URL would give every order id its own row.
    const key = routeKeyOf({ method: 'GET', baseUrl: '/api/orders', route: { path: '/:id' } });
    expect(key).toBe('GET /api/orders/:id');
  });

  it('joins the mount path to the route path without doubling the slash', () => {
    expect(routeKeyOf({ method: 'GET', baseUrl: '/api/orders', route: { path: '/' } })).toBe(
      'GET /api/orders'
    );
  });

  it('handles a route mounted at the root', () => {
    expect(routeKeyOf({ method: 'GET', baseUrl: '', route: { path: '/' } })).toBe('GET /');
  });

  it('records nothing for a request that matched no route', () => {
    // 404s are unbounded and mostly scanners; counting them would fill the
    // collection with junk keys.
    expect(routeKeyOf({ method: 'GET', baseUrl: '', route: undefined })).toBeNull();
  });
});

describe('the buffer', () => {
  it('starts empty', () => {
    expect(_buffer().size).toBe(0);
  });
});

describe('collectRoutes', () => {
  /** An app shaped like the real one: routers mounted under /api/*. */
  function sampleApp() {
    const app = express();
    const orders = express.Router();
    orders.get('/', (_q, s) => s.end());
    orders.post('/', (_q, s) => s.end());
    orders.get('/:id', (_q, s) => s.end());

    const nested = express.Router();
    nested.get('/steps', (_q, s) => s.end());
    orders.use('/:id', nested);

    app.use('/api/orders', orders);
    app.get('/', (_q, s) => s.end());
    return app;
  }

  it('finds every method on every mounted route', () => {
    const keys = collectRoutes(sampleApp()).map((r) => r.key);
    expect(keys).toContain('GET /api/orders');
    expect(keys).toContain('POST /api/orders');
    expect(keys).toContain('GET /api/orders/:id');
    expect(keys).toContain('GET /');
  });

  it('walks routers mounted inside other routers', () => {
    // routes/Order builds its paths in a loop across several sub-routers, so
    // a walker that only looked one level deep would miss most of them and
    // report them as unused.
    const keys = collectRoutes(sampleApp()).map((r) => r.key);
    expect(keys.some((k) => k.endsWith('/steps'))).toBe(true);
  });

  it('lists each endpoint once', () => {
    const keys = collectRoutes(sampleApp()).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('groups by the mounted API segment', () => {
    expect(groupOf('/api/orders/:id')).toBe('orders');
    expect(groupOf('/webhook')).toBe('webhook');
    expect(groupOf('/')).toBe('/');
  });
});
