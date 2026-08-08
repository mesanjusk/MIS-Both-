// LinkedIn OAuth 2.0 (3-legged) + organization discovery.
// Organization ("Company Page") posting requires LinkedIn's Community
// Management API product, which is partner-gated — an app without that
// approval will get a 403 on the organization lookup below. We surface that
// as a clear "permission not approved" message rather than pretending the
// connection succeeded (CLAUDE.md: "If required LinkedIn permissions are
// unavailable, show ... rather than fake success.").
const axios = require('axios');
const SocialAccount = require('../../../repositories/SocialAccount');
const { encryptToken } = require('../socialTokenCrypto');
const AppError = require('../../../utils/AppError');

const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || '202401';
const API_BASE = 'https://api.linkedin.com';

const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social', 'r_organization_admin', 'w_organization_social'].join(' ');

function isConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_REDIRECT_URI);
}

function getAuthUrl(state = '') {
  if (!isConfigured()) {
    throw new AppError('LinkedIn developer credentials not configured (LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET/LINKEDIN_REDIRECT_URI)', 503);
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    state,
    scope: LINKEDIN_SCOPES,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

async function exchangeCode(code) {
  const { data } = await axios.post(
    'https://www.linkedin.com/oauth/v2/accessToken',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  );
  return data; // { access_token, expires_in, refresh_token? }
}

async function fetchAdministeredOrganizations(accessToken) {
  const { data } = await axios.get(`${API_BASE}/v2/organizationAcls`, {
    params: {
      q: 'roleAssignee',
      role: 'ADMINISTRATOR',
      projection: '(elements*(organization~(id,localizedName,logoV2)))',
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    timeout: 30000,
  });
  return (data.elements || [])
    .map((el) => el['organization~'])
    .filter(Boolean);
}

async function handleCallback({ code, user }) {
  if (!isConfigured()) throw new AppError('LinkedIn developer credentials not configured', 503);
  if (!code) throw new AppError('Missing authorization code', 400);

  const tokenData = await exchangeCode(code);
  const accessToken = tokenData.access_token;
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 0) * 1000);

  let orgs;
  try {
    orgs = await fetchAdministeredOrganizations(accessToken);
  } catch (error) {
    const status = error.response?.status;
    if (status === 403) {
      throw new AppError('LinkedIn publishing permission not approved/configured — this app does not have Community Management API access to manage organization pages.', 403);
    }
    throw new AppError(`LinkedIn organization lookup failed: ${error.response?.data?.message || error.message}`, status || 502);
  }

  if (!orgs.length) {
    throw new AppError('LinkedIn connected, but this account is not an administrator of any organization page.', 400);
  }

  const accounts = [];
  for (const org of orgs) {
    const account = await SocialAccount.findOneAndUpdate(
      { platform: 'linkedin', platformAccountId: `urn:li:organization:${org.id}` },
      {
        platform: 'linkedin',
        accountType: 'organization',
        platformAccountId: `urn:li:organization:${org.id}`,
        name: org.localizedName || `Organization ${org.id}`,
        status: 'CONNECTED',
        accessTokenEncrypted: encryptToken(accessToken),
        refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        scopes: LINKEDIN_SCOPES.split(' '),
        connectedBy: user?.id || null,
        connectedByName: user?.userName || null,
        connectedAt: new Date(),
        lastValidatedAt: new Date(),
        lastError: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    accounts.push(account);
  }
  return accounts;
}

module.exports = { isConfigured, getAuthUrl, handleCallback, LINKEDIN_VERSION, API_BASE, LINKEDIN_SCOPES };
