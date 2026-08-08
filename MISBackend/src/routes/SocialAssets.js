/**
 * SocialAssets.js — /api/social/assets — Content Library (Cloudinary-backed).
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialMediaAsset = require('../repositories/SocialMediaAsset');
const AppError = require('../utils/AppError');
const { uploadAsset, deleteAsset } = require('../services/social/socialMediaService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

router.use(requireAuth);

// GET /api/social/assets?kind=&tag=&campaign=&createdBy=&search=
router.get('/', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const { kind, tag, campaign, createdBy, search, page = 1, limit = 60 } = req.query;
    const filter = {};
    if (kind) filter.kind = kind;
    if (tag) filter.tags = tag;
    if (campaign) filter.campaign = campaign;
    if (createdBy) filter.createdBy = createdBy;
    if (search) filter.tags = { $regex: search, $options: 'i' };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Number(limit) || 60);

    const [items, total] = await Promise.all([
      SocialMediaAsset.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      SocialMediaAsset.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, pagination: { page: pageNum, limit: limitNum, total } });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireSocialPermission('socialCreate'), upload.single('file'), async (req, res, next) => {
  try {
    const asset = await uploadAsset({ file: req.file, user: req.user });
    if (req.body.tags) asset.tags = String(req.body.tags).split(',').map((t) => t.trim()).filter(Boolean);
    if (req.body.campaign) asset.campaign = req.body.campaign;
    await asset.save();
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const asset = await SocialMediaAsset.findById(req.params.id);
    if (!asset) throw new AppError('Asset not found', 404);
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireSocialPermission('socialDelete'), async (req, res, next) => {
  try {
    const asset = await SocialMediaAsset.findById(req.params.id);
    if (!asset) throw new AppError('Asset not found', 404);
    if (asset.usageCount > 0) {
      throw new AppError('This asset is used by one or more posts and cannot be deleted. Remove it from those posts first.', 409);
    }
    await deleteAsset(asset);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
