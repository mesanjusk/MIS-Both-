const express = require("express");
const router = express.Router();
const GoogleDriveToken = require("../repositories/googleDriveToken");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/authorize");
const { createState, consumeState } = require("../services/oauthStateService");

// Drive is connected once for the whole installation, so starting the flow is
// an administrative act, not something any caller may trigger.
const OAUTH_PURPOSE = "google_drive";

const { getGoogleDriveAuthUrl, saveGoogleTokensFromCode, isDriveAutomationEnabled, getGoogleDriveConnectionStatus } = require('../services/googleDriveOAuthService');

/**
 * Validates that a redirect URL is safe (same origin as configured frontend).
 * Prevents open-redirect attacks on the OAuth callback.
 */
const escapeHtml = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function isSafeRedirect(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const allowed = [
      process.env.FRONTEND_URL,
      process.env.ALLOWED_ORIGINS,
      process.env.DEFAULT_REDIRECT_URL,
    ]
      .filter(Boolean)
      .flatMap((s) => s.split(','))
      .map((s) => s.trim().replace(/\/$/, ''));

    const origin = parsed.origin;
    return allowed.some((a) => origin === a || origin.endsWith('.' + a.replace(/^https?:\/\//, '')));
  } catch {
    return false;
  }
}


/**
 * Hand the browser a consent URL carrying a freshly issued state.
 *
 * The browser cannot send an Authorization header on a top-level navigation,
 * so the flow is two steps: the app asks for this URL over the authenticated
 * API client, then navigates to Google directly. /connect below does the same
 * thing for a caller that can present a token on the redirect itself.
 */
router.get("/auth-url", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { returnTo } = req.query;
    const safeReturnTo = isSafeRedirect(returnTo) ? returnTo : "";

    const state = await createState({
      purpose: OAUTH_PURPOSE,
      user: req.user,
      returnTo: safeReturnTo,
    });

    return res.json({ success: true, authUrl: getGoogleDriveAuthUrl(state) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to start Google OAuth",
      error: error.message,
    });
  }
});

router.get("/connect", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { returnTo } = req.query;

    // Validated now, stored against the nonce, and used at the callback — so
    // the callback cannot choose its own redirect target.
    const safeReturnTo = isSafeRedirect(returnTo) ? returnTo : "";

    const state = await createState({
      purpose: OAUTH_PURPOSE,
      user: req.user,
      returnTo: safeReturnTo,
    });

    return res.redirect(getGoogleDriveAuthUrl(state));
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to start Google OAuth",
      error: error.message,
    });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send("Missing authorization code");
    }

    // Redeem the state before touching the token record. Without this an
    // unauthorized person who could complete Google consent for this OAuth
    // client was able to replace the installation's Drive connection.
    const issued = await consumeState(state, OAUTH_PURPOSE);
    if (!issued) {
      return res
        .status(400)
        .send("This Google sign-in link is invalid, expired, or has already been used. Start again from the app.");
    }

    const result = await saveGoogleTokensFromCode(code);

    // The redirect target was validated when the flow started; `returnTo` from
    // the callback query is deliberately ignored.
    const defaultUrl = process.env.DEFAULT_REDIRECT_URL || process.env.FRONTEND_URL || '/home';
    const redirectUrl = isSafeRedirect(issued.return_to) ? issued.return_to : defaultUrl;

    return res.send(`
      <html>
        <head>
          <title>Google Drive Connected</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="font-family: Arial, sans-serif; padding: 24px; line-height: 1.5;">
          <h2>Google Drive connected successfully</h2>
          <p><strong>Connected account:</strong> ${escapeHtml(result.email || 'Unknown')}</p>
          <p>Redirecting back to your app...</p>
          <script>
            setTimeout(function () {
              window.location.href = ${JSON.stringify(redirectUrl)};
            }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    return res.status(500).send(`
      <html>
        <head>
          <title>Google Drive Connection Failed</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="font-family: Arial, sans-serif; padding: 24px; line-height: 1.5;">
          <h2>Google Drive connection failed</h2>
          <p>${escapeHtml(error.message)}</p>
        </body>
      </html>
    `);
  }
});

router.get("/status", requireAuth, async (req, res) => {
  try {
    const verifyToken = ["1", "true", "yes"].includes(
      String(req.query?.check || req.query?.verify || "").toLowerCase()
    );

    const status = await getGoogleDriveConnectionStatus({ verifyToken });

    return res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to read Google Drive status",
      error: error.message,
    });
  }
});

module.exports = router;