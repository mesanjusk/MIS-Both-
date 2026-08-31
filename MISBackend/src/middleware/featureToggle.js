const FeatureToggle = require('../repositories/featureToggle');
const logger = require('../utils/logger');

/**
 * Turns a switched-off endpoint into a 410, and refuses to switch off the
 * switches themselves.
 *
 * Express only knows which route matched *after* matching, so a guard mounted
 * ahead of the routers cannot read `req.route`. Instead each disabled key is
 * compiled once into a regexp — `GET /api/orders/:id` becomes
 * `^\/api\/orders\/[^/]+$` — and the incoming method and path are tested
 * against that small list. The list is only as long as the number of things an
 * admin has actually turned off, which is normally zero.
 *
 * The set is cached and refreshed on a timer, not read per request: a database
 * round trip in front of every call would cost more than most of the endpoints
 * it guards. The admin route calls `invalidate()` on every change, so a tick
 * takes effect at once on the instance that served it and within `REFRESH_MS`
 * on any other.
 */

const REFRESH_MS = Number(process.env.FEATURE_TOGGLE_REFRESH_MS || 30_000);

/**
 * Paths that can never be disabled, whatever the database says.
 *
 * Without this, one tick on the wrong row switches off the screen that does
 * the ticking and the only way back is a mongo shell. Anything needed to sign
 * in, to load the toggle page or to change a toggle is protected — the same
 * reasoning as refusing to let an admin remove their own access. `/webhook` is
 * here too: Meta calls it directly, and a 410 would break WhatsApp silently.
 */
const PROTECTED_PREFIXES = [
  '/api/api-usage',
  '/api/users/login',
  '/api/usergroup',
  '/api/google-drive',
  '/api/gmail/callback',
  '/api/gmail/auth-url',
  '/api/social/providers',
  '/api/public-invoices/p',
  '/api/upi/public',
  '/webhook',
];

function isProtected(path) {
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** `/api/orders/:id` → a regexp matching one path segment in place of `:id`. */
function compilePath(path) {
  const source = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) return '[^/]+';
      // Express's trailing wildcard, and any regex metacharacter in a literal.
      if (segment === '*') return '.*';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${source}/?$`);
}

/** [{ method, pattern }] for everything currently switched off. */
let rules = [];
let loadedAt = 0;
let loading = null;

function setRules(keys) {
  rules = [];
  for (const key of keys) {
    const space = key.indexOf(' ');
    if (space < 1) continue;
    const method = key.slice(0, space);
    const path = key.slice(space + 1);
    if (isProtected(path)) continue; // belt and braces: never compile a protected rule
    try {
      rules.push({ key, method, pattern: compilePath(path) });
    } catch (error) {
      logger.warn({ err: error, key }, 'could not compile a disabled route key; ignoring it');
    }
  }
}

async function refresh(force = false) {
  if (!force && Date.now() - loadedAt < REFRESH_MS) return rules;
  if (loading) return loading;

  loading = FeatureToggle.find({ disabled: true, kind: 'api' })
    .select('key')
    .lean()
    .then((rows) => {
      setRules(rows.map((row) => row.key));
      loadedAt = Date.now();
      return rules;
    })
    .catch((error) => {
      // A database blip must not disable everything, nor re-enable everything
      // unpredictably — keep the last known good set and try again later.
      logger.warn({ err: error }, 'feature toggle refresh failed; keeping last known set');
      loadedAt = Date.now();
      return rules;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

/** Called by the admin route after a change, so the tick lands immediately. */
function invalidate() {
  loadedAt = 0;
  return refresh(true);
}

/**
 * Express middleware. Mount once, before the routers.
 *
 * On a cold start the rule list is empty and the refresh is in flight, so the
 * first requests are served rather than blocked. That is the deliberate
 * direction to fail in: the other way round, a restart would 410 the whole app
 * until the database answered.
 */
function featureToggleMiddleware(req, res, next) {
  refresh();

  if (rules.length === 0) return next();

  const path = req.path || '';
  if (isProtected(path)) return next();

  const hit = rules.find((rule) => rule.method === req.method && rule.pattern.test(path));
  if (!hit) return next();

  return res.status(410).json({
    success: false,
    disabled: true,
    message:
      'This endpoint has been switched off by an administrator. It can be switched back on from Admin → API Performance.',
    key: hit.key,
  });
}

module.exports = {
  featureToggleMiddleware,
  refresh,
  invalidate,
  isProtected,
  compilePath,
  PROTECTED_PREFIXES,
  _rules: () => rules,
  _setDisabledKeys: (keys) => {
    setRules(keys);
    loadedAt = Date.now();
  },
};
