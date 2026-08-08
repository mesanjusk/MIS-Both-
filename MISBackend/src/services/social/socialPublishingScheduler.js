// Durable publishing queue — follows this repo's existing scheduler idiom
// (a setInterval poller registered once at boot, see services/messageScheduler.js)
// rather than pulling in a new job-queue library, but adds an atomic
// claim/lock per job (something the existing pollers don't need since they
// re-derive "already ran" from live data) so two backend instances can never
// publish the same SocialPublishJob twice, and a crash mid-publish leaves the
// job safely reclaimable instead of stuck forever.
const os = require('os');
const SocialPost = require('../../repositories/SocialPost');
const SocialPublishJob = require('../../repositories/SocialPublishJob');
const SocialAccount = require('../../repositories/SocialAccount');
const { getProvider } = require('./providers');
const { recordAuditEvent } = require('./socialAuditLogService');
const { emitSocialEvent } = require('../../socket');
const { classifyHttpError, SOCIAL_ERROR_CLASSES } = require('../../constants/social');
const logger = require('../../utils/logger');

const POLL_INTERVAL_MS = 15000;
const STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes — reclaim jobs a crashed worker left CLAIMED/PUBLISHING
const RETRY_BASE_DELAY_MS = 60 * 1000; // 1 minute, doubled per attempt
const BATCH_SIZE = 5;
const WORKER_ID = `${os.hostname()}:${process.pid}`;

function backoffDelay(attempts) {
  return RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
}

/** Atomically claim exactly one due job. Returns null if none available. */
async function claimNextJob() {
  const now = new Date();
  return SocialPublishJob.findOneAndUpdate(
    {
      $or: [
        { status: 'PENDING', runAt: { $lte: now }, $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }] },
        { status: { $in: ['CLAIMED', 'PUBLISHING'] }, lockedAt: { $lte: new Date(Date.now() - STALE_LOCK_MS) } },
      ],
    },
    { $set: { status: 'CLAIMED', lockedAt: now, lockedBy: WORKER_ID } },
    { new: true, sort: { runAt: 1 } }
  );
}

function classifyProviderError(error) {
  if (error?.errorClass) return error.errorClass;
  return classifyHttpError(error?.statusCode);
}

async function updatePostPlatformResult(postId, platform, patch) {
  const post = await SocialPost.findById(postId);
  if (!post) return null;

  const idx = post.platformResults.findIndex((r) => r.platform === platform);
  if (idx === -1) {
    post.platformResults.push({ platform, ...patch });
  } else {
    Object.assign(post.platformResults[idx], patch);
  }

  const results = post.platformResults.filter((r) => post.platforms.includes(r.platform));
  const allDone = results.every((r) => ['PUBLISHED', 'FAILED', 'CANCELLED'].includes(r.status));
  if (allDone) {
    const anyPublished = results.some((r) => r.status === 'PUBLISHED');
    const anyFailed = results.some((r) => r.status === 'FAILED');
    if (anyPublished && anyFailed) post.status = 'PARTIALLY_PUBLISHED';
    else if (anyPublished) post.status = 'PUBLISHED';
    else post.status = 'FAILED';
    if (anyPublished && !post.publishedAt) post.publishedAt = new Date();
  } else {
    post.status = 'PUBLISHING';
  }

  await post.save();
  return post;
}

async function processJob(job) {
  const post = await SocialPost.findById(job.post).populate('assets');
  const account = await SocialAccount.findById(job.account).select('+accessTokenEncrypted +refreshTokenEncrypted');

  if (!post || !account) {
    job.status = 'FAILED';
    job.lastError = !post ? 'Post no longer exists' : 'Account no longer exists';
    job.completedAt = new Date();
    await job.save();
    return;
  }

  // Idempotency guard: if a previous attempt crashed after the platform
  // confirmed publication but before we recorded it, don't publish twice.
  if (job.platformPostId) {
    job.status = 'PUBLISHED';
    job.completedAt = new Date();
    await job.save();
    await updatePostPlatformResult(post._id, job.platform, { status: 'PUBLISHED', platformPostId: job.platformPostId });
    return;
  }

  job.status = 'PUBLISHING';
  job.attempts += 1;
  job.startedAt = job.startedAt || new Date();
  await job.save();
  await updatePostPlatformResult(post._id, job.platform, { status: 'PUBLISHING', attempts: job.attempts });
  emitSocialEvent('publishing_started', { postId: post._id, platform: job.platform });
  await recordAuditEvent({
    action: 'post.publishing_started',
    entityType: 'post',
    entityId: post._id,
    platform: job.platform,
    detail: `Attempt ${job.attempts}`,
  });

  try {
    const provider = getProvider(job.platform);
    if (!provider.isConfigured()) {
      throw Object.assign(new Error(`${job.platform} developer credentials are not configured`), { statusCode: 503, errorClass: SOCIAL_ERROR_CLASSES.PERMANENT });
    }

    const assets = (post.assets || []).map((a) => (a.toObject ? a.toObject() : a));
    let result;
    if (post.contentType === 'video' || post.contentType === 'reel') {
      result = await provider.publishVideo(account, post, assets);
    } else if (post.contentType === 'image' || post.contentType === 'carousel') {
      result = await provider.publishPhoto(account, post, assets);
    } else {
      result = await provider.publishPost(account, post, assets);
    }

    job.platformPostId = result.platformPostId;
    job.status = 'PUBLISHED';
    job.completedAt = new Date();
    job.lastError = null;
    await job.save();

    await updatePostPlatformResult(post._id, job.platform, {
      status: 'PUBLISHED',
      platformPostId: result.platformPostId,
      platformUrl: result.platformUrl || null,
      publishedAt: new Date(),
      errorMessage: null,
    });

    await recordAuditEvent({
      action: 'post.published',
      entityType: 'post',
      entityId: post._id,
      platform: job.platform,
      newValue: { platformPostId: result.platformPostId },
    });
    emitSocialEvent('published', { postId: post._id, platform: job.platform, platformPostId: result.platformPostId });
  } catch (error) {
    const errorClass = classifyProviderError(error);
    const message = error.message || 'Unknown publishing error';
    logger.error({ err: message, platform: job.platform, postId: String(post._id) }, '[social] Publish attempt failed');

    job.lastError = message;
    job.lastErrorClass = errorClass;

    const permanentFailure =
      errorClass === SOCIAL_ERROR_CLASSES.PERMANENT ||
      errorClass === SOCIAL_ERROR_CLASSES.RECONNECT_REQUIRED ||
      errorClass === SOCIAL_ERROR_CLASSES.PERMISSION_ERROR ||
      job.attempts >= job.maxAttempts;

    if (permanentFailure) {
      job.status = 'FAILED';
      job.completedAt = new Date();
    } else {
      job.status = 'PENDING';
      job.lockedAt = null;
      job.lockedBy = null;
      job.nextRetryAt = new Date(Date.now() + backoffDelay(job.attempts));
    }
    await job.save();

    await updatePostPlatformResult(post._id, job.platform, {
      status: permanentFailure ? 'FAILED' : 'PENDING',
      errorMessage: message,
      errorClass,
      errorCode: error.providerErrorCode || null,
      attempts: job.attempts,
    });

    if (errorClass === SOCIAL_ERROR_CLASSES.RECONNECT_REQUIRED) {
      account.status = 'RECONNECT_REQUIRED';
      account.lastError = message;
      account.lastErrorAt = new Date();
      await account.save();
      await recordAuditEvent({ action: 'account.validation_failed', entityType: 'account', entityId: account._id, platform: job.platform, detail: message });
    } else if (errorClass === SOCIAL_ERROR_CLASSES.PERMISSION_ERROR) {
      account.status = 'PERMISSION_REQUIRED';
      account.lastError = message;
      account.lastErrorAt = new Date();
      await account.save();
    }

    await recordAuditEvent({
      action: permanentFailure ? 'post.publish_failed' : 'post.retry',
      entityType: 'post',
      entityId: post._id,
      platform: job.platform,
      detail: message,
    });
    emitSocialEvent(permanentFailure ? 'publish_failed' : 'publish_retry', { postId: post._id, platform: job.platform, message });
  }
}

let ticking = false;

async function tick() {
  if (ticking) return; // don't overlap ticks if a previous batch is still running
  ticking = true;
  try {
    for (let i = 0; i < BATCH_SIZE; i += 1) {
      const job = await claimNextJob();
      if (!job) break;
      await processJob(job).catch((err) => logger.error({ err: err.message }, '[social] processJob threw unexpectedly'));
    }
  } finally {
    ticking = false;
  }
}

function initSocialPublishingScheduler() {
  setInterval(() => {
    tick().catch((err) => logger.error({ err: err.message }, '[social] Publishing scheduler tick failed'));
  }, POLL_INTERVAL_MS);
}

module.exports = { initSocialPublishingScheduler, tick, processJob, claimNextJob };
