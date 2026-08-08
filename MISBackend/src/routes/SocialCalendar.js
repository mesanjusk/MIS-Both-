/**
 * SocialCalendar.js — /api/social/calendar
 * Lightweight card data for the Month/Week/Day calendar view.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialPost = require('../repositories/SocialPost');

router.use(requireAuth);

router.get('/', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const { from, to, platform, status } = req.query;
    const filter = { scheduledAt: { $ne: null } };
    if (from || to) {
      filter.scheduledAt = {};
      if (from) filter.scheduledAt.$gte = new Date(from);
      if (to) filter.scheduledAt.$lte = new Date(to);
    }
    if (platform) filter.platforms = platform;
    if (status) filter.status = status;

    const posts = await SocialPost.find(filter)
      .select('title caption platforms status approvalStatus scheduledAt timezone createdByName assets')
      .populate('assets', 'thumbnailUrl url kind')
      .sort({ scheduledAt: 1 })
      .limit(1000);

    const cards = posts.map((p) => ({
      id: p._id,
      title: p.title,
      captionPreview: (p.caption || '').slice(0, 90),
      platforms: p.platforms,
      status: p.status,
      approvalStatus: p.approvalStatus,
      scheduledAt: p.scheduledAt,
      timezone: p.timezone,
      creator: p.createdByName,
      thumbnail: p.assets?.[0]?.thumbnailUrl || p.assets?.[0]?.url || null,
    }));

    res.json({ success: true, data: cards });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
