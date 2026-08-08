const SocialProvider = require('./SocialProvider');
const { graphGet, graphPost } = require('./metaGraphClient');
const { decryptToken } = require('../socialTokenCrypto');
const AppError = require('../../../utils/AppError');

const CONTAINER_POLL_INTERVAL_MS = 3000;
const CONTAINER_POLL_TIMEOUT_MS = 90000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Instagram professional (business/creator) accounts only, always published
// through the parent Facebook Page's access token — see metaOAuthService.js.
class MetaInstagramProvider extends SocialProvider {
  constructor() {
    super('instagram');
  }

  isConfigured() {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  }

  _token(account) {
    const token = decryptToken(account.accessTokenEncrypted);
    if (!token) throw new AppError('Instagram account is not connected (no access token on file)', 400);
    return token;
  }

  async validateConnection(account) {
    try {
      const data = await graphGet(account.platformAccountId, { fields: 'id,username' }, this._token(account));
      account.status = 'CONNECTED';
      account.lastValidatedAt = new Date();
      account.lastError = null;
      account.username = data.username || account.username;
      await account.save();
      return { connected: true, account: account.toSafeJSON() };
    } catch (error) {
      account.status = error.errorClass === 'RECONNECT_REQUIRED' ? 'RECONNECT_REQUIRED' : 'ERROR';
      account.lastError = error.message;
      account.lastErrorAt = new Date();
      await account.save();
      return { connected: false, message: error.message };
    }
  }

  async _waitForContainerReady(containerId, token) {
    const deadline = Date.now() + CONTAINER_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const data = await graphGet(containerId, { fields: 'status_code' }, token);
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR') {
        throw new AppError('Instagram media processing failed for this asset', 502);
      }
      await sleep(CONTAINER_POLL_INTERVAL_MS);
    }
    throw new AppError('Timed out waiting for Instagram to finish processing the media', 504);
  }

  async _publish(account, containerId) {
    const token = this._token(account);
    const published = await graphPost(`${account.platformAccountId}/media_publish`, { creation_id: containerId }, token);
    return { platformPostId: published.id, platformUrl: null };
  }

  async publishPhoto(account, post, assets) {
    const token = this._token(account);
    if (!assets.length) throw new AppError('No image asset provided for Instagram photo post', 400);

    if (assets.length === 1) {
      const container = await graphPost(
        `${account.platformAccountId}/media`,
        { image_url: assets[0].url, caption: post.caption || '' },
        token
      );
      return this._publish(account, container.id);
    }

    // Carousel: create each child item, then a parent CAROUSEL container.
    const children = [];
    for (const asset of assets) {
      const params = asset.kind === 'video'
        ? { video_url: asset.url, is_carousel_item: true }
        : { image_url: asset.url, is_carousel_item: true };
      const child = await graphPost(`${account.platformAccountId}/media`, params, token);
      children.push(child.id);
    }
    const parent = await graphPost(
      `${account.platformAccountId}/media`,
      { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption || '' },
      token
    );
    return this._publish(account, parent.id);
  }

  async publishVideo(account, post, assets) {
    const token = this._token(account);
    const asset = assets[0];
    if (!asset) throw new AppError('No video asset provided for Instagram Reel', 400);

    const container = await graphPost(
      `${account.platformAccountId}/media`,
      { media_type: 'REELS', video_url: asset.url, caption: post.caption || '' },
      token
    );
    await this._waitForContainerReady(container.id, token);
    return this._publish(account, container.id);
  }

  async getPublishStatus(account, platformPostId) {
    const data = await graphGet(platformPostId, { fields: 'id,permalink' }, this._token(account));
    return { status: 'PUBLISHED', raw: data };
  }

  async getAnalytics(account, platformPostId) {
    const metrics = ['impressions', 'reach', 'likes', 'comments', 'shares', 'saved'];
    try {
      const data = await graphGet(`${platformPostId}/insights`, { metric: metrics.join(',') }, this._token(account));
      const byName = Object.fromEntries((data.data || []).map((m) => [m.name, m.values?.[0]?.value]));
      return {
        impressions: byName.impressions ?? null,
        reach: byName.reach ?? null,
        likes: byName.likes ?? null,
        comments: byName.comments ?? null,
        shares: byName.shares ?? null,
        saves: byName.saved ?? null,
        raw: data,
      };
    } catch (error) {
      return { notAvailable: true, message: error.message };
    }
  }

  // Instagram's Graph API does not support deleting published media.
  async deletePost() {
    throw new AppError('Instagram does not support deleting a published post via the API. Delete it from the Instagram app.', 400);
  }
}

module.exports = MetaInstagramProvider;
