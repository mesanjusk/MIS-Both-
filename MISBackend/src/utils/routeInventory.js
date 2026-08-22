/**
 * The list of every endpoint this server actually serves.
 *
 * Read out of Express's own router stack rather than by parsing the route
 * files. Parsing would drift the moment somebody mounts a router differently
 * or builds paths in a loop — `createRouter.js` in routes/Order does exactly
 * that — and an inventory that quietly misses endpoints is worse than none,
 * because the missing ones look unused.
 */

/** Turn one layer's regexp back into the path fragment it was built from. */
function mountPathOf(layer) {
  if (layer.path) return layer.path;

  const source = layer?.regexp?.source;
  if (!source) return '';
  // Express compiles `app.use('/api/users', …)` to /^\/api\/users\/?(?=\/|$)/i
  if (source === '^\\/?(?=\\/|$)') return '';

  return source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/')
    .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':param');
}

const clean = (path) => `/${String(path || '').replace(/^\/+|\/+$/g, '')}`.replace(/\/+/g, '/');

/**
 * Every `{ method, path, key }` the app serves, deduplicated and sorted.
 * `key` is `"GET /api/orders/:id"` — the same shape the usage collection and
 * the toggle registry use, so all three join on it without translation.
 */
function collectRoutes(app) {
  const found = new Map();
  const stack = app?._router?.stack || app?.router?.stack || [];

  const walk = (layers, prefix) => {
    for (const layer of layers) {
      if (layer.route) {
        const path = clean(`${prefix}${layer.route.path}`);
        for (const [method, enabled] of Object.entries(layer.route.methods || {})) {
          if (!enabled || method === '_all') continue;
          const key = `${method.toUpperCase()} ${path}`;
          if (!found.has(key)) found.set(key, { key, method: method.toUpperCase(), path });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, `${prefix}${mountPathOf(layer)}`);
      }
    }
  };

  walk(stack, '');
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** The mounted API groups — `/api/orders`, `/api/users` — for grouping the report. */
function groupOf(path) {
  const match = /^\/api\/([^/]+)/.exec(path);
  if (match) return match[1];
  const first = /^\/([^/]+)/.exec(path);
  return first ? first[1] : '/';
}

module.exports = { collectRoutes, groupOf, mountPathOf };
