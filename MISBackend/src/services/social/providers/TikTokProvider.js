const axios = require('axios');
const SocialProvider = require('./SocialProvider');
const AppError = require('../../../utils/AppError');
const { classifyHttpError } = require('../../../constants/social');
const { decryptToken } = require('../socialTokenCrypto');
const { downloadTrustedMediaBuffer } = require('../socialMediaService');
const tiktokOAuthService = require('./tiktokOAuthService');

const { API_BASE } = tiktokOAuthService;
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB, within TikTok's allowed chunk range

function parseTikTokError(error) {
  const status = error.response?.status;
  const apiError = error.response?.data?.error;
  const message = apiError?.message || error.message;
  const appError = new AppError(`TikTok API error: ${message}`, status || 500);
  appError.errorClass = classifyHttpError(status);
  return appError;
}

class TikTokProvider extends SocialProvider {
  constructor() {
    super('tiktok');
  }

  isConfigured() {
    return tiktokOAuthService.isConfigured();
  }

  async _token(account) {
    const token = decryptToken(account.accessTokenEncrypted);
    if (!token) throw new AppError('TikTok account is not connected (no access token on file)', 400);
    // TikTok access tokens are short-lived (~24h) — proactively refresh if past expiry.
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now()) {
      return tiktokOAuthService.refreshAccessToken(account);
    }
    return token;
  }

  async refreshToken(account) {
    await tiktokOAuthService.refreshAccessToken(account);
    return account;
  }

  async validateConnection(account) {
    try {
      const token = await this._token(account);
      const creator = await tiktokOAuthService.fetchCreatorInfo(token);
      account.status = 'CONNECTED';
      account.lastValidatedAt = new Date();
      account.lastError = null;
      account.metadata = {
        ...account.metadata,
        privacyLevelOptions: creator.privacy_level_options || ['SELF_ONLY'],
        publicPostingAllowed: (creator.privacy_level_options || []).some((opt) => opt !== 'SELF_ONLY'),
      };
      await account.save();
      return { connected: true, account: account.toSafeJSON() };
    } catch (error) {
      const parsed = error.statusCode ? error : parseTikTokError(error);
      account.status = parsed.errorClass === 'RECONNECT_REQUIRED' ? 'RECONNECT_REQUIRED' : 'ERROR';
      account.lastError = parsed.message;
      account.lastErrorAt = new Date();
      await account.save();
      return { connected: false, message: parsed.message };
    }
  }

  _resolvePrivacyLevel(account, post) {
    const requested = post.platformSettings?.tiktokPrivacyLevel;
    const allowed = account.metadata?.privacyLevelOptions || ['SELF_ONLY'];
    if (requested && allowed.includes(requested)) return requested;
    if (!account.metadata?.publicPostingAllowed) {
      throw new AppError(
        account.metadata?.auditNote ||
          'This TikTok app has not passed audit for public posting — only "Only Me" visibility is available.',
        403
      );
    }
    return allowed[0] || 'SELF_ONLY';
  }

  async publishPhoto() {
    throw new AppError(
      'TikTok photo posting is not enabled in this integration yet (video/Reel publishing via the Content Posting API is supported).',
      400
    );
  }

  async publishVideo(account, post, assets) {
    const asset = assets[0];
    if (!asset) throw new AppError('No video asset provided for TikTok post', 400);
    const token = await this._token(account);
    const settings = post.platformSettings || {};

    const { buffer } = await downloadTrustedMediaBuffer(asset.url);
    const totalChunkCount = Math.ceil(buffer.length / CHUNK_SIZE) || 1;

    let init;
    try {
      const { data } = await axios.post(
        `${API_BASE}/v2/post/publish/video/init/`,
        {
          post_info: {
            title: (post.caption || '').slice(0, 2200),
            privacy_level: this._resolvePrivacyLevel(account, post),
            disable_duet: Boolean(settings.tiktokDisableDuet),
            disable_comment: Boolean(settings.tiktokDisableComment),
            disable_stitch: Boolean(settings.tiktokDisableStitch),
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: buffer.length,
            chunk_size: Math.min(CHUNK_SIZE, buffer.length),
            total_chunk_count: totalChunkCount,
          },
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' }, timeout: 30000 }
      );
      if (data.error?.code && data.error.code !== 'ok') {
        throw new AppError(`TikTok publish init failed: ${data.error.message}`, 400);
      }
      init = data.data; // { publish_id, upload_url }
    } catch (error) {
      throw error.statusCode ? error : parseTikTokError(error);
    }

    for (let i = 0; i < totalChunkCount; i += 1) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.length) - 1;
      const chunk = buffer.subarray(start, end + 1);
      await axios.put(init.upload_url, chunk, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000,
      });
    }

    return { platformPostId: init.publish_id, platformUrl: null, pendingProcessing: true };
  }

  async getPublishStatus(account, publishId) {
    const token = await this._token(account);
    try {
      const { data } = await axios.post(
        `${API_BASE}/v2/post/publish/status/fetch/`,
        { publish_id: publishId },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' } }
      );
      const status = data.data?.status; // PROCESSING_UPLOAD | PROCESSING_DOWNLOAD | PUBLISH_COMPLETE | FAILED
      return { status, raw: data.data };
    } catch (error) {
      throw parseTikTokError(error);
    }
  }

  // TikTok's Content Posting API does not expose per-post analytics for
  // videos published via API in the standard product tier.
  async getAnalytics() {
    return { notAvailable: true, message: 'Not available from API.' };
  }

  async deletePost() {
    throw new AppError('TikTok does not support deleting a published post via the Content Posting API.', 400);
  }
}

module.exports = TikTokProvider;
