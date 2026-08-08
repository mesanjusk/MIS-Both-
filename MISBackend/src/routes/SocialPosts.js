/**
 * SocialPosts.js — /api/social/posts
 *
 * Create → submit for approval → approve/reject → schedule → publish.
 * See services/social/socialPublishingService.js for the queue side and
 * services/social/socialPublishingScheduler.js for the worker that actually
 * calls out to each platform's provider.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireSocialPermission } = require('../middleware/socialAuthorize');
const SocialPost = require('../repositories/SocialPost');
const SocialMediaAsset = require('../repositories/SocialMediaAsset');
const SocialApproval = require('../repositories/SocialApproval');
const SocialPublishJob = require('../repositories/SocialPublishJob');
const AppError = require('../utils/AppError');
const { isValidPlatform } = require('../constants/social');
const { recordAuditEvent } = require('../services/social/socialAuditLogService');
const { createJobsForPost, cancelJobsForPost, rescheduleJobsForPost } = require('../services/social/socialPublishingService');
const { hasSocialPermission } = require('../services/social/socialPermissionService');
const { emitSocialEvent } = require('../socket');

router.use(requireAuth);

function isOwner(post, req) {
  return String(post.createdBy) === String(req.user.id);
}

async function bumpAssetUsage(assetIds, delta) {
  if (!assetIds?.length) return;
  await SocialMediaAsset.updateMany({ _id: { $in: assetIds } }, { $inc: { usageCount: delta } });
}

// GET /api/social/posts?status=&approvalStatus=&platform=&createdBy=&campaign=&from=&to=
router.get('/', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const { status, approvalStatus, platform, createdBy, campaign, from, to, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (platform) filter.platforms = platform;
    if (createdBy) filter.createdBy = createdBy;
    if (campaign) filter.campaign = campaign;
    if (from || to) {
      filter.scheduledAt = {};
      if (from) filter.scheduledAt.$gte = new Date(from);
      if (to) filter.scheduledAt.$lte = new Date(to);
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Number(limit) || 30);

    const [items, total] = await Promise.all([
      SocialPost.find(filter)
        .populate('assets')
        .populate('campaign', 'name')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      SocialPost.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, pagination: { page: pageNum, limit: limitNum, total } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireSocialPermission('socialView'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id).populate('assets').populate('campaign', 'name');
    if (!post) throw new AppError('Post not found', 404);
    const approvals = await SocialApproval.find({ post: post._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { ...post.toObject(), approvals } });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireSocialPermission('socialCreate'), async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.contentType) throw new AppError('contentType is required', 400);
    if (body.platforms?.some((p) => !isValidPlatform(p))) throw new AppError('Unknown platform in platforms[]', 400);

    const post = await SocialPost.create({
      title: body.title || '',
      contentType: body.contentType,
      assets: body.assets || [],
      caption: body.caption || '',
      hashtags: body.hashtags || [],
      platforms: body.platforms || [],
      accountsByPlatform: body.accountsByPlatform || {},
      platformSettings: body.platformSettings || {},
      scheduledAt: body.scheduledAt || null,
      timezone: body.timezone || 'Asia/Kolkata',
      campaign: body.campaign || null,
      linkedEntityType: body.linkedEntityType || null,
      linkedEntityId: body.linkedEntityId || null,
      createdBy: req.user.id,
      createdByName: req.user.userName,
      status: 'DRAFT',
      approvalStatus: 'NOT_SUBMITTED',
    });

    await bumpAssetUsage(post.assets, 1);
    await recordAuditEvent({ action: 'post.created', entityType: 'post', entityId: post._id, actor: req.user.id, actorName: req.user.userName, req });

    res.status(201).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireSocialPermission('socialEdit'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (!isOwner(post, req)) throw new AppError('You can only edit your own posts', 403);
    if (!['DRAFT', 'REJECTED'].includes(post.status)) {
      throw new AppError(`Cannot edit a post with status "${post.status}"`, 400);
    }

    const before = post.toObject();
    const editable = ['title', 'contentType', 'caption', 'hashtags', 'platforms', 'accountsByPlatform', 'platformSettings', 'scheduledAt', 'timezone', 'campaign', 'assets'];
    for (const key of editable) {
      if (req.body[key] !== undefined) post[key] = req.body[key];
    }
    if (req.body.assets) {
      const removed = before.assets.filter((a) => !req.body.assets.includes(String(a)));
      const added = req.body.assets.filter((a) => !before.assets.some((b) => String(b) === a));
      await bumpAssetUsage(removed, -1);
      await bumpAssetUsage(added, 1);
    }
    if (post.status === 'REJECTED') {
      post.status = 'DRAFT';
      post.approvalStatus = 'NOT_SUBMITTED';
      post.rejectionReason = null;
    }
    await post.save();

    await recordAuditEvent({ action: 'post.edited', entityType: 'post', entityId: post._id, actor: req.user.id, actorName: req.user.userName, oldValue: before, newValue: post.toObject(), req });
    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireSocialPermission('socialDelete'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (!['DRAFT', 'REJECTED', 'CANCELLED'].includes(post.status) && !isOwner(post, req)) {
      throw new AppError(`Cannot delete a post with status "${post.status}"`, 400);
    }
    await bumpAssetUsage(post.assets, -1);
    await SocialPublishJob.deleteMany({ post: post._id, status: { $in: ['PENDING', 'CANCELLED', 'FAILED'] } });
    await post.deleteOne();
    await recordAuditEvent({ action: 'post.deleted', entityType: 'post', entityId: post._id, actor: req.user.id, actorName: req.user.userName, req });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/social/posts/:id/submit — DRAFT -> PENDING_APPROVAL
router.post('/:id/submit', requireSocialPermission('socialCreate'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (!isOwner(post, req)) throw new AppError('You can only submit your own posts', 403);
    if (post.status !== 'DRAFT') throw new AppError(`Cannot submit a post with status "${post.status}"`, 400);
    if (!post.platforms.length) throw new AppError('Select at least one platform before submitting', 400);
    if (!post.assets.length && post.contentType !== 'text') throw new AppError('Add at least one media asset before submitting', 400);

    post.status = 'PENDING_APPROVAL';
    post.approvalStatus = 'PENDING';
    await post.save();

    await recordAuditEvent({ action: 'post.submitted', entityType: 'post', entityId: post._id, actor: req.user.id, actorName: req.user.userName, req });
    emitSocialEvent('post_submitted', { postId: post._id, title: post.title });
    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/approve', requireSocialPermission('socialApprove'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (post.approvalStatus !== 'PENDING') throw new AppError(`Post is not pending approval (current: "${post.approvalStatus}")`, 400);

    post.approvalStatus = 'APPROVED';
    post.approvedBy = req.user.id;
    post.approvedByName = req.user.userName;
    post.approvedAt = new Date();
    post.status = 'APPROVED';
    await post.save();

    await SocialApproval.create({ post: post._id, decision: 'APPROVED', decidedBy: req.user.id, decidedByName: req.user.userName });
    await recordAuditEvent({ action: 'post.approved', entityType: 'post', entityId: post._id, actor: req.user.id, actorName: req.user.userName, req });
    emitSocialEvent('post_approved', { postId: post._id });

    // If a schedule was already chosen at creation time, queue it immediately.
    if (post.scheduledAt) {
      await createJobsForPost(post, { actor: req.user });
    }

    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reject', requireSocialPermission('socialApprove'), async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) throw new AppError('A rejection reason is required', 400);

    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (post.approvalStatus !== 'PENDING') throw new AppError(`Post is not pending approval (current: "${post.approvalStatus}")`, 400);

    post.approvalStatus = 'REJECTED';
    post.status = 'REJECTED';
    post.rejectionReason = reason.trim();
    await post.save();

    await SocialApproval.create({ post: post._id, decision: 'REJECTED', reason: reason.trim(), decidedBy: req.user.id, decidedByName: req.user.userName });
    await recordAuditEvent({ action: 'post.rejected', entityType: 'post', entityId: post._id, actor: req.user.id, actorName: req.user.userName, detail: reason.trim(), req });
    emitSocialEvent('post_rejected', { postId: post._id, reason: reason.trim() });

    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
});

// POST /api/social/posts/:id/schedule — body: { scheduledAt, timezone }
router.post('/:id/schedule', requireSocialPermission('socialPublish'), async (req, res, next) => {
  try {
    const { scheduledAt, timezone } = req.body || {};
    if (!scheduledAt) throw new AppError('scheduledAt is required', 400);

    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);

    const hasJobs = await SocialPublishJob.exists({ post: post._id });
    if (hasJobs) {
      await rescheduleJobsForPost(post._id, new Date(scheduledAt), { actor: req.user, timezone });
    } else {
      if (post.approvalStatus !== 'APPROVED') throw new AppError('Post must be approved before scheduling', 400);
      post.scheduledAt = new Date(scheduledAt);
      if (timezone) post.timezone = timezone;
      await post.save();
      await createJobsForPost(post, { actor: req.user });
    }

    const updated = await SocialPost.findById(post._id);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', requireSocialPermission('socialEdit'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (!isOwner(post, req)) {
      const allowed = req.user.userGroup && (await hasSocialPermission(req.user.userGroup, 'socialPublish'));
      if (!allowed) throw new AppError('You can only cancel your own posts', 403);
    }
    if (['PUBLISHED', 'CANCELLED'].includes(post.status)) throw new AppError(`Cannot cancel a post with status "${post.status}"`, 400);

    await cancelJobsForPost(post._id, { actor: req.user });
    const updated = await SocialPost.findById(post._id);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/social/posts/:id/publish — publish immediately (Publisher action)
router.post('/:id/publish', requireSocialPermission('socialPublish'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (post.approvalStatus !== 'APPROVED') throw new AppError('Post must be approved before publishing', 400);

    post.scheduledAt = new Date();
    await post.save();
    await createJobsForPost(post, { actor: req.user });

    const updated = await SocialPost.findById(post._id);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/social/posts/:id/retry — reset FAILED platform jobs for another attempt
router.post('/:id/retry', requireSocialPermission('socialPublish'), async (req, res, next) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    if (!['FAILED', 'PARTIALLY_PUBLISHED'].includes(post.status)) {
      throw new AppError(`Cannot retry a post with status "${post.status}"`, 400);
    }

    const failedPlatforms = post.platformResults.filter((r) => r.status === 'FAILED').map((r) => r.platform);
    if (!failedPlatforms.length) throw new AppError('No failed platforms to retry', 400);

    await SocialPublishJob.updateMany(
      { post: post._id, platform: { $in: failedPlatforms } },
      { $set: { status: 'PENDING', runAt: new Date(), attempts: 0, nextRetryAt: null, lastError: null, lockedAt: null, lockedBy: null } }
    );
    for (const platform of failedPlatforms) {
      const idx = post.platformResults.findIndex((r) => r.platform === platform);
      if (idx !== -1) post.platformResults[idx].status = 'PENDING';
    }
    post.retryCount += 1;
    post.status = 'PUBLISHING';
    await post.save();

    await recordAuditEvent({ action: 'post.retry', entityType: 'post', entityId: post._id, actor: req.user.id, actorName: req.user.userName, detail: failedPlatforms.join(', '), req });
    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
