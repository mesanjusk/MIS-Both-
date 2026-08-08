const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { SOCIAL_PLATFORMS, SOCIAL_PUBLISH_JOB_STATUSES } = require('../constants/social');

// One durable job per (post, platform) pair. The publishing scheduler polls
// for due jobs and atomically claims them (status PENDING -> CLAIMED with a
// lockedBy/lockedAt stamp) via findOneAndUpdate, so two instances can never
// publish the same job twice, and a crash mid-publish just leaves the job
// claimed until it's past a stale-lock threshold and gets reclaimed.
const SocialPublishJobSchema = new mongoose.Schema(
  {
    jobUuid: { type: String, default: uuidv4, unique: true, index: true },

    post: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', required: true, index: true },
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true },

    status: { type: String, enum: SOCIAL_PUBLISH_JOB_STATUSES, default: 'PENDING', index: true },

    runAt: { type: Date, required: true, index: true },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null }, // process id / hostname:pid

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRetryAt: { type: Date, default: null },

    lastError: { type: String, default: null },
    lastErrorClass: { type: String, default: null },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // Idempotency: set once the provider confirms a platform post id, so a
    // duplicate claim/retry after a crash can detect "already published"
    // instead of posting twice.
    platformPostId: { type: String, default: null },
  },
  { timestamps: true }
);

SocialPublishJobSchema.index({ status: 1, runAt: 1 });
SocialPublishJobSchema.index({ post: 1, platform: 1 }, { unique: true });
SocialPublishJobSchema.index({ lockedAt: 1 });

module.exports = mongoose.model('SocialPublishJob', SocialPublishJobSchema);
