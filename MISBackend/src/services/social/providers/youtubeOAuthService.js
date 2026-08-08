// YouTube OAuth — reuses the same Google Cloud project credentials as
// Drive/Gmail (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET) with its own
// YOUTUBE_REDIRECT_URI + upload scopes, mirroring gmailOAuthService.js's
// pattern (encrypted refresh token, client.refreshAccessToken()).
const { google } = require('googleapis');
const SocialAccount = require('../../../repositories/SocialAccount');
const { encryptToken, decryptToken } = require('../socialTokenCrypto');
const AppError = require('../../../utils/AppError');

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI);
}

function getOAuthClient() {
  if (!isConfigured()) {
    throw new AppError('YouTube developer credentials not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/YOUTUBE_REDIRECT_URI)', 503);
  }
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.YOUTUBE_REDIRECT_URI);
}

function getAuthUrl(state = '') {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: YOUTUBE_SCOPES,
    state,
  });
}

async function handleCallback({ code, user }) {
  if (!code) throw new AppError('Missing authorization code', 400);
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  if (!tokens.refresh_token) {
    throw new AppError('No refresh token received from Google. Revoke access at myaccount.google.com/permissions then reconnect.', 400);
  }

  const youtube = google.youtube({ version: 'v3', auth: client });
  const { data } = await youtube.channels.list({ part: ['snippet', 'contentDetails'], mine: true });
  const channel = data.items?.[0];
  if (!channel) {
    throw new AppError('No YouTube channel found for this Google account.', 400);
  }

  const account = await SocialAccount.findOneAndUpdate(
    { platform: 'youtube', platformAccountId: channel.id },
    {
      platform: 'youtube',
      accountType: 'channel',
      platformAccountId: channel.id,
      name: channel.snippet?.title || 'YouTube Channel',
      profileImageUrl: channel.snippet?.thumbnails?.default?.url || null,
      status: 'CONNECTED',
      accessTokenEncrypted: encryptToken(tokens.access_token),
      refreshTokenEncrypted: encryptToken(tokens.refresh_token),
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: YOUTUBE_SCOPES,
      connectedBy: user?.id || null,
      connectedByName: user?.userName || null,
      connectedAt: new Date(),
      lastValidatedAt: new Date(),
      lastError: null,
      metadata: {
        // Surfaced verbatim in the Social Accounts UI — YouTube upload
        // access can be capped/restricted for unverified API projects
        // until the app passes an audit; we don't hide that limitation.
        apiProjectVerificationNote:
          'Uploads may be restricted to private/unlisted visibility until this Google Cloud project passes YouTube API audit/verification.',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return account;
}

/** Get a live access token, refreshing via the stored refresh token if needed. Persists the refreshed token. */
async function getFreshAccessToken(account) {
  const refreshToken = decryptToken(account.refreshTokenEncrypted);
  if (!refreshToken) throw new AppError('YouTube channel is not connected (no refresh token on file). Reconnect required.', 400);

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await client.refreshAccessToken();
    account.accessTokenEncrypted = encryptToken(credentials.access_token);
    account.tokenExpiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
    account.status = 'CONNECTED';
    account.lastError = null;
    await account.save();
    client.setCredentials(credentials);
    return client;
  } catch (error) {
    account.status = 'RECONNECT_REQUIRED';
    account.lastError = error.message;
    account.lastErrorAt = new Date();
    await account.save();
    throw new AppError(`YouTube authentication failed for ${account.name}. Please reconnect this channel.`, 401);
  }
}

module.exports = { isConfigured, getAuthUrl, handleCallback, getFreshAccessToken, YOUTUBE_SCOPES };
