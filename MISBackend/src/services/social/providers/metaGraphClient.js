// Low-level Graph API helper shared by MetaFacebookProvider and
// MetaInstagramProvider (Instagram publishing rides on the parent Page's
// access token, so both need the same request plumbing). Reuses the OAuth
// token-exchange helpers already built for WhatsApp Cloud API in
// services/metaApiService.js instead of duplicating them.
const axios = require('axios');
const AppError = require('../../../utils/AppError');
const { classifyHttpError } = require('../../../constants/social');

const META_API_VERSION = process.env.META_API_VERSION || 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function parseGraphError(error) {
  const metaError = error.response?.data?.error;
  const status = error.response?.status;
  const appError = new AppError(
    metaError ? `Meta API error: ${metaError.message} (code=${metaError.code}, subcode=${metaError.error_subcode || '-'})` : (error.message || 'Meta API request failed'),
    status || 500
  );
  appError.providerErrorCode = metaError?.code ? String(metaError.code) : null;
  appError.errorClass = classifyHttpError(status);
  // Meta signals an expired/invalid token with code 190 regardless of HTTP status.
  if (metaError?.code === 190) appError.errorClass = 'RECONNECT_REQUIRED';
  return appError;
}

async function graphGet(path, params = {}, accessToken) {
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${path}`, {
      params: { ...params, access_token: accessToken },
      timeout: 30000,
    });
    return data;
  } catch (error) {
    throw parseGraphError(error);
  }
}

async function graphPost(path, params = {}, accessToken) {
  try {
    const { data } = await axios.post(`${GRAPH_BASE}/${path}`, null, {
      params: { ...params, access_token: accessToken },
      timeout: 60000,
    });
    return data;
  } catch (error) {
    throw parseGraphError(error);
  }
}

async function graphDelete(path, accessToken) {
  try {
    const { data } = await axios.delete(`${GRAPH_BASE}/${path}`, {
      params: { access_token: accessToken },
      timeout: 30000,
    });
    return data;
  } catch (error) {
    throw parseGraphError(error);
  }
}

module.exports = { GRAPH_BASE, META_API_VERSION, graphGet, graphPost, graphDelete, parseGraphError };
