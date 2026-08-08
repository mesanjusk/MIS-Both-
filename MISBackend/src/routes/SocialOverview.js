/**
 * SocialOverview.js — /api/social/overview — Social Media dashboard summary.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialPost = require('../repositories/SocialPost');
const SocialAccount = require('../repositories/SocialAccount');
const { SOCIAL_PLATFORMS } = require('../constants/social');
const { providers } = require('../services/social/providers');

router.use(requireAuth);

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function startOfWeek(d = new Date()) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return startOfDay(new Date(d.setDate(diff)));
}

router.get('/', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(new Date(now));

    const [scheduledToday, pendingApproval, publishing, publishedThisWeek, failed, accounts, recentPosts, upcomingPosts] = await Promise.all([
      SocialPost.countDocuments({ scheduledAt: { $gte: todayStart, $lte: todayEnd }, status: { $in: ['SCHEDULED', 'APPROVED'] } }),
      SocialPost.countDocuments({ approvalStatus: 'PENDING' }),
      SocialPost.countDocuments({ status: 'PUBLISHING' }),
      SocialPost.countDocuments({ status: { $in: ['PUBLISHED', 'PARTIALLY_PUBLISHED'] }, publishedAt: { $gte: weekStart } }),
      SocialPost.countDocuments({ status: 'FAILED' }),
      SocialAccount.countDocuments({ status: 'CONNECTED' }),
      SocialPost.find({}).sort({ updatedAt: -1 }).limit(8).select('title status approvalStatus platforms updatedAt createdByName'),
      SocialPost.find({ scheduledAt: { $gte: now }, status: { $in: ['SCHEDULED', 'APPROVED'] } }).sort({ scheduledAt: 1 }).limit(8).select('title platforms scheduledAt status'),
    ]);

    const platformAccounts = await SocialAccount.find({}).lean();
    const platformStatus = SOCIAL_PLATFORMS.map((platform) => {
      const configured = providers[platform]?.isConfigured?.() ?? false;
      const accountsForPlatform = platformAccounts.filter((a) => a.platform === platform);
      let status = 'Not connected';
      if (!configured) status = 'Developer credentials not configured';
      else if (accountsForPlatform.some((a) => a.status === 'CONNECTED')) status = 'Connected';
      else if (accountsForPlatform.some((a) => a.status === 'PERMISSION_REQUIRED')) status = 'Approval required';
      else if (accountsForPlatform.some((a) => a.status === 'RECONNECT_REQUIRED')) status = 'Reconnect required';
      return { platform, status };
    });

    res.json({
      success: true,
      data: {
        scheduledToday,
        pendingApproval,
        publishing,
        publishedThisWeek,
        failed,
        connectedAccounts: accounts,
        recentPosts,
        upcomingPosts,
        platformStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
