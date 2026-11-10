/**
 * SocialAssets.js — /api/social/assets — Content Library (Cloudinary-backed).
 */
const express = require('express');
const multer = require('multer');
const os = require('node:os');
const fs = require('node:fs/promises');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialMediaAsset = require('../repositories/SocialMediaAsset');
const AppError = require('../utils/AppError');
const { uploadAsset, deleteAsset } = require('../services/social/socialMediaService');

// Large videos must never occupy hundreds of MB of Node heap. Multer writes
// to temporary disk; the Cloudinary service streams it and we always clean up.
const UPLOAD_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']);
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, UPLOAD_MIMES.has(file.mimetype)),
});

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
  } finally {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
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
