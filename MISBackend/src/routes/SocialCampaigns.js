/**
 * SocialCampaigns.js — /api/social/campaigns
 * Lightweight grouping entity (e.g. "August Rakhi Campaign").
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialCampaign = require('../repositories/SocialCampaign');
const SocialPost = require('../repositories/SocialPost');
const AppError = require('../utils/AppError');

router.use(requireAuth);

router.get('/', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const campaigns = await SocialCampaign.find({ isActive: true }).sort({ createdAt: -1 });
    const counts = await SocialPost.aggregate([
      { $match: { campaign: { $ne: null } } },
      { $group: { _id: '$campaign', count: { $sum: 1 } } },
    ]);
    const countByCampaign = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    res.json({
      success: true,
      data: campaigns.map((c) => ({ ...c.toObject(), postCount: countByCampaign[String(c._id)] || 0 })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireSocialPermission('socialCreate'), async (req, res, next) => {
  try {
    const { name, description, startDate, endDate } = req.body || {};
    if (!name?.trim()) throw new AppError('Campaign name is required', 400);
    const campaign = await SocialCampaign.create({
      name: name.trim(),
      description: description || '',
      startDate: startDate || null,
      endDate: endDate || null,
      createdBy: req.user.id,
      createdByName: req.user.userName,
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
