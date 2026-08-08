const axios = require('axios');
const SocialProvider = require('./SocialProvider');
const AppError = require('../../../utils/AppError');
const { classifyHttpError } = require('../../../constants/social');
const { decryptToken } = require('../socialTokenCrypto');
const { downloadTrustedMediaBuffer } = require('../socialMediaService');
const { LINKEDIN_VERSION, API_BASE } = require('./linkedinOAuthService');

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra,
  };
}

function parseLinkedInError(error) {
  const status = error.response?.status;
  const message = error.response?.data?.message || error.message;
  const appError = new AppError(`LinkedIn API error: ${message}`, status || 500);
  appError.errorClass = classifyHttpError(status);
  return appError;
}

class LinkedInProvider extends SocialProvider {
  constructor() {
    super('linkedin');
  }

  isConfigured() {
    return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  }

  _token(account) {
    const token = decryptToken(account.accessTokenEncrypted);
    if (!token) throw new AppError('LinkedIn organization is not connected (no access token on file)', 400);
    return token;
  }

  async validateConnection(account) {
    try {
      const orgId = account.platformAccountId.split(':').pop();
      const { data } = await axios.get(`${API_BASE}/v2/organizations/${orgId}`, {
        params: { projection: '(id,localizedName)' },
        headers: headers(this._token(account)),
        timeout: 20000,
      });
      account.status = 'CONNECTED';
      account.lastValidatedAt = new Date();
      account.lastError = null;
      account.name = data.localizedName || account.name;
      await account.save();
      return { connected: true, account: account.toSafeJSON() };
    } catch (error) {
      const parsed = parseLinkedInError(error);
      account.status = parsed.errorClass === 'RECONNECT_REQUIRED' ? 'RECONNECT_REQUIRED' : 'ERROR';
      account.lastError = parsed.message;
      account.lastErrorAt = new Date();
      await account.save();
      return { connected: false, message: parsed.message };
    }
  }

  _visibility(post) {
    return post.platformSettings?.linkedinVisibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC';
  }

  async _createPost(account, body) {
    try {
      const { data, headers: respHeaders } = await axios.post(`${API_BASE}/rest/posts`, body, {
        headers: headers(this._token(account), { 'Content-Type': 'application/json' }),
        timeout: 60000,
      });
      const postId = respHeaders['x-restli-id'] || data?.id;
      return {
        platformPostId: postId,
        platformUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : null,
      };
    } catch (error) {
      throw parseLinkedInError(error);
    }
  }

  async publishPost(account, post) {
    return this._createPost(account, {
      author: account.platformAccountId,
      commentary: post.caption || '',
      visibility: this._visibility(post),
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  }

  async _initializeImageUpload(account) {
    const { data } = await axios.post(
      `${API_BASE}/rest/images?action=initializeUpload`,
      { initializeUploadRequest: { owner: account.platformAccountId } },
      { headers: headers(this._token(account), { 'Content-Type': 'application/json' }) }
    );
    return data.value; // { uploadUrl, image (urn) }
  }

  async publishPhoto(account, post, assets) {
    const asset = assets[0];
    if (!asset) throw new AppError('No image asset provided for LinkedIn post', 400);

    const { uploadUrl, image } = await this._initializeImageUpload(account);
    const { buffer } = await downloadTrustedMediaBuffer(asset.url);
    await axios.put(uploadUrl, buffer, { headers: { Authorization: `Bearer ${this._token(account)}` } });

    return this._createPost(account, {
      author: account.platformAccountId,
      commentary: post.caption || '',
      visibility: this._visibility(post),
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: image } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  }

  async publishVideo(account, post, assets) {
    const asset = assets[0];
    if (!asset) throw new AppError('No video asset provided for LinkedIn post', 400);

    const { buffer } = await downloadTrustedMediaBuffer(asset.url);
    const { data } = await axios.post(
      `${API_BASE}/rest/videos?action=initializeUpload`,
      { initializeUploadRequest: { owner: account.platformAccountId, fileSizeBytes: buffer.length, uploadCaptions: false, uploadThumbnail: false } },
      { headers: headers(this._token(account), { 'Content-Type': 'application/json' }) }
    );
    const { uploadInstructions, video } = data.value;

    const uploadedPartIds = [];
    for (const part of uploadInstructions) {
      const chunk = buffer.subarray(part.firstByte, part.lastByte + 1);
      const resp = await axios.put(part.uploadUrl, chunk, { headers: { Authorization: `Bearer ${this._token(account)}` } });
      uploadedPartIds.push(resp.headers.etag);
    }

    await axios.post(
      `${API_BASE}/rest/videos?action=finalizeUpload`,
      { finalizeUploadRequest: { video, uploadToken: '', uploadedPartIds } },
      { headers: headers(this._token(account), { 'Content-Type': 'application/json' }) }
    );

    return this._createPost(account, {
      author: account.platformAccountId,
      commentary: post.caption || '',
      visibility: this._visibility(post),
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: video } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  }

  async getPublishStatus(account, platformPostId) {
    try {
      const { data } = await axios.get(`${API_BASE}/rest/posts/${encodeURIComponent(platformPostId)}`, {
        headers: headers(this._token(account)),
      });
      return { status: data.lifecycleState || 'PUBLISHED', raw: data };
    } catch (error) {
      throw parseLinkedInError(error);
    }
  }

  async getAnalytics(account, platformPostId) {
    try {
      const { data } = await axios.get(`${API_BASE}/rest/organizationalEntityShareStatistics`, {
        params: {
          q: 'organizationalEntity',
          organizationalEntity: account.platformAccountId,
          shares: `List(${platformPostId})`,
        },
        headers: headers(this._token(account)),
      });
      const stats = data.elements?.[0]?.totalShareStatistics;
      if (!stats) return { notAvailable: true, message: 'LinkedIn did not return share statistics for this post.' };
      return {
        impressions: stats.impressionCount ?? null,
        clicks: stats.clickCount ?? null,
        likes: stats.likeCount ?? null,
        comments: stats.commentCount ?? null,
        shares: stats.shareCount ?? null,
        engagement: stats.engagement ?? null,
        raw: stats,
      };
    } catch (error) {
      return { notAvailable: true, message: parseLinkedInError(error).message };
    }
  }

  async deletePost(account, platformPostId) {
    try {
      await axios.delete(`${API_BASE}/rest/posts/${encodeURIComponent(platformPostId)}`, {
        headers: headers(this._token(account)),
      });
      return { deleted: true };
    } catch (error) {
      throw parseLinkedInError(error);
    }
  }
}

module.exports = LinkedInProvider;
