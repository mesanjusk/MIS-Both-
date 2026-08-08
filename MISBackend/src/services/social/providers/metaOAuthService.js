// Shared Meta (Facebook Login for Business) OAuth flow — one connect/callback
// pair discovers both Facebook Pages and any Instagram professional account
// attached to them, per CLAUDE.md: "Build one Meta provider layer shared by
// Instagram and Facebook." Reuses the token-exchange helpers already built
// for WhatsApp Cloud API (services/metaApiService.js) instead of duplicating
// the OAuth code-exchange logic.
const metaApiService = require('../../metaApiService');
const { graphGet } = require('./metaGraphClient');
const { encryptToken } = require('../socialTokenCrypto');
const SocialAccount = require('../../../repositories/SocialAccount');
const AppError = require('../../../utils/AppError');
const logger = require('../../../utils/logger');

const META_API_VERSION = process.env.META_API_VERSION || 'v18.0';

const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'read_insights',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'business_management',
].join(',');

function isConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI);
}

function getAuthUrl(state = '') {
  if (!isConfigured()) {
    throw new AppError('Meta developer credentials not configured (META_APP_ID/META_APP_SECRET/META_REDIRECT_URI)', 503);
  }
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: process.env.META_REDIRECT_URI,
    state,
    scope: META_SCOPES,
    response_type: 'code',
  });
  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
}

async function handleCallback({ code, user }) {
  if (!isConfigured()) {
    throw new AppError('Meta developer credentials not configured', 503);
  }
  if (!code) throw new AppError('Missing authorization code', 400);

  const shortLived = await metaApiService.exchangeCodeForShortLivedToken({
    code,
    redirectUri: process.env.META_REDIRECT_URI,
  });
  if (!shortLived?.access_token) {
    throw new AppError('Meta did not return an access token', 502);
  }

  const longLived = await metaApiService.exchangeForLongLivedToken(shortLived.access_token);
  const userToken = longLived?.access_token || shortLived.access_token;

  const pages = await graphGet(
    'me/accounts',
    { fields: 'id,name,access_token,picture,instagram_business_account{id,username,profile_picture_url}' },
    userToken
  );

  const connected = { facebook: [], instagram: [] };

  for (const page of pages?.data || []) {
    const fbAccount = await SocialAccount.findOneAndUpdate(
      { platform: 'facebook', platformAccountId: page.id },
      {
        platform: 'facebook',
        accountType: 'page',
        platformAccountId: page.id,
        name: page.name,
        profileImageUrl: page.picture?.data?.url || null,
        status: 'CONNECTED',
        accessTokenEncrypted: encryptToken(page.access_token),
        scopes: META_SCOPES.split(','),
        connectedBy: user?.id || null,
        connectedByName: user?.userName || null,
        connectedAt: new Date(),
        lastValidatedAt: new Date(),
        lastError: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    connected.facebook.push(fbAccount.accountUuid);

    const ig = page.instagram_business_account;
    if (ig?.id) {
      const igAccount = await SocialAccount.findOneAndUpdate(
        { platform: 'instagram', platformAccountId: ig.id },
        {
          platform: 'instagram',
          accountType: 'business',
          platformAccountId: ig.id,
          name: ig.username || page.name,
          username: ig.username || null,
          profileImageUrl: ig.profile_picture_url || null,
          parentPageId: page.id,
          status: 'CONNECTED',
          // Instagram Graph API publishing calls are authenticated with the
          // parent Page's access token, not a separate IG user token.
          accessTokenEncrypted: encryptToken(page.access_token),
          scopes: META_SCOPES.split(','),
          connectedBy: user?.id || null,
          connectedByName: user?.userName || null,
          connectedAt: new Date(),
          lastValidatedAt: new Date(),
          lastError: null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      connected.instagram.push(igAccount.accountUuid);
    }
  }

  if (!connected.facebook.length) {
    logger.warn('[social/meta] OAuth succeeded but user has no manageable Facebook Pages');
  }

  return connected;
}

module.exports = { isConfigured, getAuthUrl, handleCallback, META_SCOPES };
