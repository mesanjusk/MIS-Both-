const { google } = require('googleapis');
const SocialProvider = require('./SocialProvider');
const AppError = require('../../../utils/AppError');
const youtubeOAuthService = require('./youtubeOAuthService');
const { streamTrustedMedia } = require('../socialMediaService');

class YouTubeProvider extends SocialProvider {
  constructor() {
    super('youtube');
  }

  isConfigured() {
    return youtubeOAuthService.isConfigured();
  }

  async _client(account) {
    return youtubeOAuthService.getFreshAccessToken(account);
  }

  async refreshToken(account) {
    await this._client(account);
    return account;
  }

  async validateConnection(account) {
    try {
      const auth = await this._client(account);
      const youtube = google.youtube({ version: 'v3', auth });
      const { data } = await youtube.channels.list({ part: ['snippet'], mine: true });
      const channel = data.items?.[0];
      account.status = 'CONNECTED';
      account.lastValidatedAt = new Date();
      account.lastError = null;
      if (channel?.snippet?.title) account.name = channel.snippet.title;
      await account.save();
      return { connected: true, account: account.toSafeJSON() };
    } catch (error) {
      account.lastError = error.message;
      account.lastErrorAt = new Date();
      await account.save();
      return { connected: false, message: error.message };
    }
  }

  // YouTube's Data API has no dedicated "video content type" other than the
  // upload itself — Shorts are just videos with the right aspect ratio/length,
  // so publishVideo handles both regular uploads and Reel/Short-form content.
  async publishVideo(account, post, assets) {
    const asset = assets[0];
    if (!asset) throw new AppError('No video asset provided for YouTube upload', 400);

    const auth = await this._client(account);
    const youtube = google.youtube({ version: 'v3', auth });
    const { stream } = await streamTrustedMedia(asset.url);

    const settings = post.platformSettings || {};
    const privacyStatus = settings.youtubePrivacy || 'public';

    try {
      const { data } = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: settings.youtubeTitle || post.title || post.caption?.slice(0, 100) || 'Untitled',
            description: settings.youtubeDescription || post.caption || '',
            tags: settings.youtubeTags || post.hashtags || undefined,
            categoryId: settings.youtubeCategoryId || undefined,
          },
          status: {
            privacyStatus,
            ...(post.scheduledAt && privacyStatus !== 'public'
              ? { publishAt: new Date(post.scheduledAt).toISOString() }
              : {}),
          },
        },
        media: { body: stream },
      });

      return {
        platformPostId: data.id,
        platformUrl: `https://www.youtube.com/watch?v=${data.id}`,
      };
    } catch (error) {
      const status = error.code || error.response?.status;
      if (status === 403) {
        throw new AppError(
          'YouTube upload rejected (403). This is often caused by an unverified API project/quota, or a channel that has not completed audio-video verification.',
          403
        );
      }
      throw error;
    }
  }

  async getPublishStatus(account, platformPostId) {
    const auth = await this._client(account);
    const youtube = google.youtube({ version: 'v3', auth });
    const { data } = await youtube.videos.list({ part: ['status', 'processingDetails'], id: [platformPostId] });
    const video = data.items?.[0];
    return { status: video?.processingDetails?.processingStatus || 'unknown', raw: video };
  }

  async getAnalytics(account, platformPostId) {
    const auth = await this._client(account);
    const youtube = google.youtube({ version: 'v3', auth });
    try {
      const { data } = await youtube.videos.list({ part: ['statistics'], id: [platformPostId] });
      const stats = data.items?.[0]?.statistics;
      if (!stats) return { notAvailable: true, message: 'No statistics returned by YouTube for this video.' };
      return {
        videoViews: stats.viewCount ? Number(stats.viewCount) : null,
        likes: stats.likeCount ? Number(stats.likeCount) : null,
        comments: stats.commentCount ? Number(stats.commentCount) : null,
        raw: stats,
      };
    } catch (error) {
      return { notAvailable: true, message: error.message };
    }
  }

  async deletePost(account, platformPostId) {
    const auth = await this._client(account);
    const youtube = google.youtube({ version: 'v3', auth });
    await youtube.videos.delete({ id: platformPostId });
    return { deleted: true };
  }
}

module.exports = YouTubeProvider;
