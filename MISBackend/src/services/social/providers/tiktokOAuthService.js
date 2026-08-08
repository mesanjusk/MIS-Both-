// TikTok Content Posting API OAuth (official API only — no browser automation).
// Unaudited apps are restricted by TikTok to SELF_ONLY (private) posting;
// creator_info/query tells us which privacy levels this app/creator is
// actually allowed to use, which the Social Accounts UI must show honestly
// instead of claiming public posting is live (CLAUDE.md TIKTOK section).
const axios = require('axios');
const SocialAccount = require('../../../repositories/SocialAccount');
const { encryptToken, decryptToken } = require('../socialTokenCrypto');
const AppError = require('../../../utils/AppError');

const API_BASE = 'https://open.tiktokapis.com';
const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'].join(',');

function isConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI);
}

function getAuthUrl(state = '') {
  if (!isConfigured()) {
    throw new AppError('TikTok developer credentials not configured (TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET/TIKTOK_REDIRECT_URI)', 503);
  }
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    response_type: 'code',
    scope: TIKTOK_SCOPES,
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const { data } = await axios.post(
    `${API_BASE}/v2/oauth/token/`,
    new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  );
  if (data.error) {
    throw new AppError(`TikTok token exchange failed: ${data.error_description || data.error}`, 400);
  }
  return data; // { access_token, expires_in, refresh_token, refresh_expires_in, open_id, scope }
}

async function fetchCreatorInfo(accessToken) {
  const { data } = await axios.post(
    `${API_BASE}/v2/post/publish/creator_info/query/`,
    {},
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, timeout: 20000 }
  );
  if (data.error?.code && data.error.code !== 'ok') {
    throw new AppError(`TikTok creator info request failed: ${data.error.message}`, 400);
  }
  return data.data; // { creator_username, creator_nickname, creator_avatar_url, privacy_level_options, ... }
}

async function handleCallback({ code, user }) {
  if (!isConfigured()) throw new AppError('TikTok developer credentials not configured', 503);
  if (!code) throw new AppError('Missing authorization code', 400);

  const tokenData = await exchangeCode(code);
  const creator = await fetchCreatorInfo(tokenData.access_token);

  const publicPostingAllowed = (creator.privacy_level_options || []).some((opt) => opt !== 'SELF_ONLY');

  const account = await SocialAccount.findOneAndUpdate(
    { platform: 'tiktok', platformAccountId: tokenData.open_id },
    {
      platform: 'tiktok',
      accountType: 'creator',
      platformAccountId: tokenData.open_id,
      name: creator.creator_nickname || creator.creator_username || 'TikTok Creator',
      username: creator.creator_username || null,
      profileImageUrl: creator.creator_avatar_url || null,
      status: 'CONNECTED',
      accessTokenEncrypted: encryptToken(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      tokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 0) * 1000),
      scopes: (tokenData.scope || TIKTOK_SCOPES).split(','),
      connectedBy: user?.id || null,
      connectedByName: user?.userName || null,
      connectedAt: new Date(),
      lastValidatedAt: new Date(),
      lastError: null,
      metadata: {
        privacyLevelOptions: creator.privacy_level_options || ['SELF_ONLY'],
        publicPostingAllowed,
        maxVideoPostDurationSec: creator.max_video_post_duration_sec || null,
        commentDisabled: Boolean(creator.comment_disabled),
        duetDisabled: Boolean(creator.duet_disabled),
        stitchDisabled: Boolean(creator.stitch_disabled),
        auditNote: publicPostingAllowed
          ? null
          : 'This app has not passed TikTok audit for public posting — only "Only Me" (SELF_ONLY) visibility is available until TikTok approves the app.',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return account;
}

async function refreshAccessToken(account) {
  const refreshToken = decryptToken(account.refreshTokenEncrypted);
  if (!refreshToken) throw new AppError('TikTok account is not connected (no refresh token on file). Reconnect required.', 400);

  const { data } = await axios.post(
    `${API_BASE}/v2/oauth/token/`,
    new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  );

  if (data.error) {
    account.status = 'RECONNECT_REQUIRED';
    account.lastError = data.error_description || data.error;
    account.lastErrorAt = new Date();
    await account.save();
    throw new AppError(`TikTok token refresh failed for ${account.name}. Please reconnect.`, 401);
  }

  account.accessTokenEncrypted = encryptToken(data.access_token);
  if (data.refresh_token) account.refreshTokenEncrypted = encryptToken(data.refresh_token);
  account.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 0) * 1000);
  account.status = 'CONNECTED';
  account.lastError = null;
  await account.save();
  return data.access_token;
}

module.exports = { isConfigured, getAuthUrl, handleCallback, fetchCreatorInfo, refreshAccessToken, API_BASE, TIKTOK_SCOPES };
