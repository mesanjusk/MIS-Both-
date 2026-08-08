/**
 * SocialAnalytics.js — /api/social/analytics
 * Stores/reads periodic provider-reported metric snapshots. Never invents a
 * metric the platform API didn't actually return.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialAnalyticsSnapshot = require('../repositories/SocialAnalyticsSnapshot');
const SocialPost = require('../repositories/SocialPost');
const SocialAccount = require('../repositories/SocialAccount');
const AppError = require('../utils/AppError');
const { getProvider } = require('../services/social/providers');

router.use(requireAuth);

// GET /api/social/analytics?platform=&postId=&accountId=&from=&to=
router.get('/', requireSocialPermission('socialAnalyticsView'), async (req, res, next) => {
  try {
    const { platform, postId, accountId, from, to } = req.query;
    const filter = {};
    if (platform) filter.platform = platform;
    if (postId) filter.post = postId;
    if (accountId) filter.account = accountId;
    if (from || to) {
      filter.capturedAt = {};
      if (from) filter.capturedAt.$gte = new Date(from);
      if (to) filter.capturedAt.$lte = new Date(to);
    }

    const snapshots = await SocialAnalyticsSnapshot.find(filter).sort({ capturedAt: -1 }).limit(500);
    res.json({ success: true, data: snapshots });
  } catch (error) {
    next(error);
  }
});

// POST /api/social/analytics/refresh — body: { postId, platform } — real provider call, stores a snapshot
router.post('/refresh', requireSocialPermission('socialAnalyticsView'), async (req, res, next) => {
  try {
    const { postId, platform } = req.body || {};
    if (!postId || !platform) throw new AppError('postId and platform are required', 400);

    const post = await SocialPost.findById(postId);
    if (!post) throw new AppError('Post not found', 404);

    const result = post.platformResults.find((r) => r.platform === platform);
    if (!result?.platformPostId) throw new AppError(`Post has not been published to ${platform} yet`, 400);

    const account = await SocialAccount.findById(result.accountId || post.accountsByPlatform?.get?.(platform))
      .select('+accessTokenEncrypted +refreshTokenEncrypted');
    if (!account) throw new AppError('No connected account found for this platform on this post', 404);

    const provider = getProvider(platform);
    const metrics = await provider.getAnalytics(account, result.platformPostId);

    if (metrics.notAvailable) {
      return res.json({ success: true, data: { notAvailable: true, message: metrics.message || 'Not available from API.' } });
    }

    const snapshot = await SocialAnalyticsSnapshot.create({
      account: account._id,
      post: post._id,
      platform,
      platformPostId: result.platformPostId,
      metrics: {
        impressions: metrics.impressions ?? null,
        reach: metrics.reach ?? null,
        likes: metrics.likes ?? null,
        comments: metrics.comments ?? null,
        shares: metrics.shares ?? null,
        saves: metrics.saves ?? null,
        engagement: metrics.engagement ?? null,
        clicks: metrics.clicks ?? null,
        videoViews: metrics.videoViews ?? null,
        followers: metrics.followers ?? null,
        subscribers: metrics.subscribers ?? null,
      },
      raw: metrics.raw || null,
    });

    res.json({ success: true, data: snapshot });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
