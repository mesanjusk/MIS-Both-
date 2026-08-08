const SocialProvider = require('./SocialProvider');
const { graphGet, graphPost, graphDelete } = require('./metaGraphClient');
const { decryptToken } = require('../socialTokenCrypto');
const AppError = require('../../../utils/AppError');

// Facebook Pages only — CLAUDE.md: "Facebook must support Pages, not
// arbitrary personal-profile posting." OAuth is handled once for both
// Facebook + Instagram by metaOAuthService.js.
class MetaFacebookProvider extends SocialProvider {
  constructor() {
    super('facebook');
  }

  isConfigured() {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  }

  _token(account) {
    const token = decryptToken(account.accessTokenEncrypted);
    if (!token) throw new AppError('Facebook Page is not connected (no access token on file)', 400);
    return token;
  }

  async validateConnection(account) {
    try {
      const data = await graphGet(account.platformAccountId, { fields: 'id,name' }, this._token(account));
      account.status = 'CONNECTED';
      account.lastValidatedAt = new Date();
      account.lastError = null;
      account.name = data.name || account.name;
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

  async publishPost(account, post) {
    const data = await graphPost(`${account.platformAccountId}/feed`, { message: post.caption || '' }, this._token(account));
    return { platformPostId: data.id, platformUrl: null };
  }

  async publishPhoto(account, post, assets) {
    const asset = assets[0];
    if (!asset) throw new AppError('No image asset provided for Facebook photo post', 400);
    const data = await graphPost(
      `${account.platformAccountId}/photos`,
      { url: asset.url, caption: post.caption || '', published: true },
      this._token(account)
    );
    const postId = data.post_id || data.id;
    return { platformPostId: postId, platformUrl: `https://www.facebook.com/${postId}` };
  }

  async publishVideo(account, post, assets) {
    const asset = assets[0];
    if (!asset) throw new AppError('No video asset provided for Facebook video post', 400);
    const data = await graphPost(
      `${account.platformAccountId}/videos`,
      { file_url: asset.url, description: post.caption || '' },
      this._token(account)
    );
    return { platformPostId: data.id, platformUrl: `https://www.facebook.com/${data.id}` };
  }

  async getPublishStatus(account, platformPostId) {
    const data = await graphGet(platformPostId, { fields: 'id,status' }, this._token(account));
    return { status: data.status?.video_status || 'ready', raw: data };
  }

  async getAnalytics(account, platformPostId) {
    const metrics = ['post_impressions', 'post_engaged_users', 'post_clicks', 'post_reactions_by_type_total'];
    try {
      const data = await graphGet(`${platformPostId}/insights`, { metric: metrics.join(',') }, this._token(account));
      const byName = Object.fromEntries((data.data || []).map((m) => [m.name, m.values?.[0]?.value]));
      return {
        impressions: byName.post_impressions ?? null,
        reach: null,
        engagement: byName.post_engaged_users ?? null,
        clicks: byName.post_clicks ?? null,
        likes: typeof byName.post_reactions_by_type_total === 'object'
          ? Object.values(byName.post_reactions_by_type_total).reduce((a, b) => a + b, 0)
          : null,
        raw: data,
      };
    } catch (error) {
      return { notAvailable: true, message: error.message };
    }
  }

  async deletePost(account, platformPostId) {
    await graphDelete(platformPostId, this._token(account));
    return { deleted: true };
  }
}

module.exports = MetaFacebookProvider;
