const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * Google's `Error 400: redirect_uri_mismatch` means the `redirect_uri` this
 * server put in the consent URL is not, byte for byte, one of the Authorized
 * redirect URIs on the OAuth client in Google Cloud Console. Google never
 * redirects back when it rejects the request, so the callback route below can
 * never see the failure and no server log records it — the operator is left
 * guessing which of the three Google flows sent what.
 *
 * This endpoint answers that: it reports the exact string each flow sends, so
 * it can be copied verbatim into Console. It also flags the differences that
 * cause a mismatch that reads as identical: a trailing slash, http vs https,
 * or a callback path that no longer matches where the route is mounted.
 *
 * No credential is exposed — client ID and secret are reported only as
 * present/absent. Redirect URIs are public by nature (they travel in the query
 * string of every consent URL), but this stays behind requireAuth because the
 * shape of a deployment is not public.
 */

// Each Google flow, and the path its callback is actually mounted at. Keep
// these in step with the mounts in index.js — a route moved without its env
// var updated is exactly the mismatch this endpoint exists to catch.
const GOOGLE_FLOWS = [
  { flow: 'Google Drive', envVar: 'GOOGLE_REDIRECT_URI',  expectedPath: '/api/google-drive/callback' },
  { flow: 'Gmail',        envVar: 'GMAIL_REDIRECT_URI',   expectedPath: '/api/gmail/callback' },
  { flow: 'YouTube',      envVar: 'YOUTUBE_REDIRECT_URI', expectedPath: '/api/social/providers/youtube/callback' },
];

/** The public origin of this server, as the browser reached it. */
function publicOrigin(req) {
  // Render terminates TLS at its proxy, so req.protocol reads "http" here.
  const proto = (req.get('x-forwarded-proto') || '').split(',')[0].trim() || req.protocol;
  return `${proto}://${req.get('host')}`;
}

/** Everything about one configured URI that Google compares and we can check. */
function inspect(rawValue, expectedPath, origin) {
  if (!rawValue) {
    return { configured: false, problems: ['Not set — this flow cannot start at all.'] };
  }

  const problems = [];
  let parsed = null;
  try {
    parsed = new URL(rawValue);
  } catch {
    problems.push('Not a valid absolute URL.');
  }

  if (rawValue !== rawValue.trim()) {
    problems.push('Has leading or trailing whitespace — Google compares the raw string.');
  }
  if (parsed) {
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      problems.push('Uses http on a non-localhost host — Google requires https.');
    }
    if (parsed.pathname.replace(/\/$/, '') !== expectedPath) {
      problems.push(`Path is "${parsed.pathname}" but this server serves the callback at "${expectedPath}".`);
    }
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
      problems.push('Ends in a trailing slash — Google treats that as a different URI.');
    }
    if (parsed.search || parsed.hash) {
      problems.push('Contains a query string or fragment — Google rejects both.');
    }
    if (parsed.origin !== origin) {
      problems.push(`Points at ${parsed.origin} but this server is reachable at ${origin}.`);
    }
  }

  return { configured: true, value: rawValue, problems };
}

// GET /api/google-oauth/redirect-uris — what to paste into Google Cloud Console
router.get('/redirect-uris', requireAuth, (req, res) => {
  const origin = publicOrigin(req);

  const flows = GOOGLE_FLOWS.map(({ flow, envVar, expectedPath }) => ({
    flow,
    envVar,
    expectedUri: `${origin}${expectedPath}`,
    ...inspect(process.env[envVar], expectedPath, origin),
  }));

  res.json({
    success: true,
    result: {
      clientIdConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
      clientSecretConfigured: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      serverOrigin: origin,
      flows,
      // Paste this list into Google Cloud Console → APIs & Services →
      // Credentials → the OAuth 2.0 Client ID → Authorized redirect URIs.
      // A flow with no problems contributes the value it actually sends; one
      // with problems contributes the URI it should be sending instead, since
      // echoing back a URI just reported as malformed would only move the
      // mismatch into Console.
      authorizedRedirectUris: flows.map((f) =>
        f.configured && f.problems.length === 0 ? f.value : f.expectedUri
      ),
      note:
        'Every URI under authorizedRedirectUris must appear character-for-character in ' +
        'Google Cloud Console → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs, ' +
        'and any flow listed with problems also needs its env var corrected to that URI. ' +
        'Changes in Console can take a few minutes to take effect. If this deployment ' +
        'deliberately completes OAuth on a different public domain than the one serving ' +
        'this request, use that domain instead of serverOrigin.',
    },
  });
});

module.exports = router;
