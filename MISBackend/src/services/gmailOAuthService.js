const { google } = require('googleapis');
const GmailAccount = require('../repositories/GmailAccount');
const { encrypt, decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getOAuthClient() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Gmail OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REDIRECT_URI'
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function generateAuthUrl(state = '') {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',   // force consent so refresh_token is always issued
    scope: GMAIL_SCOPES,
    state,
  });
}

async function fetchAccountEmail(oauth2Client) {
  try {
    const { data } = await google.oauth2({ auth: oauth2Client, version: 'v2' }).userinfo.get();
    return data?.email || null;
  } catch {
    return null;
  }
}

async function saveTokensFromCode(code, addedBy = '') {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const email = await fetchAccountEmail(client);
  if (!email) throw new Error('Could not retrieve Gmail address from Google. Please try again.');

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token received. Revoke access at myaccount.google.com/permissions then reconnect.'
    );
  }

  const account = await GmailAccount.findOneAndUpdate(
    { email },
    {
      email,
      refreshToken: encrypt(tokens.refresh_token),
      ...(tokens.access_token ? { accessToken: encrypt(tokens.access_token) } : {}),
      tokenExpiry: tokens.expiry_date || null,
      isConnected: true,
      isActive: true,
      addedBy,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { email: account.email, accountId: account.accountId };
}

async function getAuthorizedGmailClient(accountId) {
  const account = await GmailAccount.findOne({ accountId });
  if (!account?.refreshToken) {
    throw new Error('Gmail account not found or missing refresh token. Please reconnect.');
  }

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: decrypt(account.refreshToken) });

  let credentials;
  try {
    const result = await client.refreshAccessToken();
    credentials = result.credentials;
  } catch (err) {
    account.isConnected = false;
    account.lastError    = err.message;
    account.lastErrorAt  = new Date();
    await account.save();
    throw new Error(`Gmail auth failed for ${account.email}. Please reconnect this account.`);
  }

  if (credentials?.access_token) {
    account.accessToken = encrypt(credentials.access_token);
    account.tokenExpiry = credentials.expiry_date || null;
    if (credentials.refresh_token) account.refreshToken = encrypt(credentials.refresh_token);
    account.isConnected = true;
    await account.save();
  }

  client.setCredentials({
    access_token:  credentials?.access_token,
    refresh_token: decrypt(account.refreshToken),
    expiry_date:   credentials?.expiry_date || account.tokenExpiry,
  });

  return { client, account };
}

async function selectBestAccount(preferredAccountId = null) {
  const today = new Date().toISOString().slice(0, 10);

  if (preferredAccountId) {
    const preferred = await GmailAccount.findOne({
      accountId: preferredAccountId,
      isActive: true,
      isConnected: true,
    });
    if (preferred) {
      if (preferred.dailySentDate !== today) {
        preferred.dailySentCount = 0;
        preferred.dailySentDate  = today;
        await preferred.save();
      }
      if (preferred.dailySentCount < preferred.dailyLimit) return preferred;
    }
  }

  const accounts = await GmailAccount.find({ isActive: true, isConnected: true }).lean();
  for (const raw of accounts) {
    const doc = await GmailAccount.findById(raw._id);
    if (doc.dailySentDate !== today) {
      doc.dailySentCount = 0;
      doc.dailySentDate  = today;
      await doc.save();
    }
    if (doc.dailySentCount < doc.dailyLimit) return doc;
  }

  throw new Error('All Gmail accounts have reached their daily sending limit. Add another account.');
}

module.exports = { generateAuthUrl, saveTokensFromCode, getAuthorizedGmailClient, selectBestAccount };
