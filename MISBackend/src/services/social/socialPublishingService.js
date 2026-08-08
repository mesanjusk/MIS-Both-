const SocialPost = require('../../repositories/SocialPost');
const SocialPublishJob = require('../../repositories/SocialPublishJob');
const AppError = require('../../utils/AppError');
const { recordAuditEvent } = require('./socialAuditLogService');
const { emitSocialEvent } = require('../../socket');

/**
 * createJobsForPost — one durable SocialPublishJob per targeted platform.
 * Upsert on the (post, platform) unique index so calling this twice (e.g. a
 * retried "approve" request) never creates duplicate jobs.
 */
async function createJobsForPost(post, { actor } = {}) {
  if (!post.platforms?.length) {
    throw new AppError('Post has no platforms selected', 400);
  }

  const runAt = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
  const jobs = [];

  for (const platform of post.platforms) {
    const accountId = post.accountsByPlatform?.get
      ? post.accountsByPlatform.get(platform)
      : post.accountsByPlatform?.[platform];
    if (!accountId) {
      throw new AppError(`No connected account selected for platform "${platform}"`, 400);
    }

    const job = await SocialPublishJob.findOneAndUpdate(
      { post: post._id, platform },
      {
        post: post._id,
        platform,
        account: accountId,
        status: 'PENDING',
        runAt,
        attempts: 0,
        nextRetryAt: null,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    jobs.push(job);
  }

  post.status = post.scheduledAt && post.scheduledAt > new Date() ? 'SCHEDULED' : 'PUBLISHING';
  post.platformResults = post.platforms.map((platform) => {
    const existing = post.platformResults.find((r) => r.platform === platform);
    return existing || { platform, status: 'PENDING', attempts: 0 };
  });
  await post.save();

  await recordAuditEvent({
    action: 'post.scheduled',
    entityType: 'post',
    entityId: post._id,
    actor: actor?.id,
    actorName: actor?.userName,
    detail: `Queued for ${post.platforms.join(', ')} at ${runAt.toISOString()}`,
  });
  emitSocialEvent('post_scheduled', { postId: post._id, scheduledAt: runAt });

  return jobs;
}

async function cancelJobsForPost(postId, { actor } = {}) {
  await SocialPublishJob.updateMany(
    { post: postId, status: { $in: ['PENDING', 'CLAIMED'] } },
    { $set: { status: 'CANCELLED' } }
  );
  await SocialPost.updateOne({ _id: postId }, { $set: { status: 'CANCELLED' } });
  await recordAuditEvent({
    action: 'post.cancelled',
    entityType: 'post',
    entityId: postId,
    actor: actor?.id,
    actorName: actor?.userName,
  });
  emitSocialEvent('post_cancelled', { postId });
}

/** Calendar drag-and-drop reschedule — updates pending jobs + the post, preserving timezone. */
async function rescheduleJobsForPost(postId, newRunAt, { actor, timezone } = {}) {
  const post = await SocialPost.findById(postId);
  if (!post) throw new AppError('Post not found', 404);
  if (!['SCHEDULED', 'APPROVED'].includes(post.status)) {
    throw new AppError(`Cannot reschedule a post with status "${post.status}"`, 400);
  }

  const result = await SocialPublishJob.updateMany(
    { post: postId, status: 'PENDING' },
    { $set: { runAt: newRunAt } }
  );
  if (!result.matchedCount) {
    throw new AppError('No pending publish jobs found for this post (it may already be publishing)', 400);
  }

  post.scheduledAt = newRunAt;
  if (timezone) post.timezone = timezone;
  await post.save();

  await recordAuditEvent({
    action: 'post.reschedule',
    entityType: 'post',
    entityId: postId,
    actor: actor?.id,
    actorName: actor?.userName,
    newValue: { scheduledAt: newRunAt },
  });
  emitSocialEvent('post_rescheduled', { postId, scheduledAt: newRunAt });
  return post;
}

module.exports = { createJobsForPost, cancelJobsForPost, rescheduleJobsForPost };
