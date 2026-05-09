const express = require("express");
const router = express.Router();
const GoogleDriveToken = require("../repositories/googleDriveToken");
const { requireAuth } = require("../middleware/auth");

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


router.get("/connect", requireAuth, async (req, res) => {
  try {
    const { returnTo } = req.query;
    const url = getGoogleDriveAuthUrl(returnTo || "");
    return res.redirect(url);
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
    const { code, state, returnTo } = req.query;

    if (!code) {
      return res.status(400).send("Missing authorization code");
    }

    const result = await saveGoogleTokensFromCode(code);

    // Validate redirect URL to prevent open redirect attacks
    const defaultUrl = process.env.DEFAULT_REDIRECT_URL || process.env.FRONTEND_URL || '/home';
    const candidateUrl = returnTo || state || defaultUrl;
    const redirectUrl = isSafeRedirect(candidateUrl) ? candidateUrl : defaultUrl;

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