// Social Media module — shared enums/constants.
// Follows the plain-array/helper-function convention used by orderStages.js
// rather than a JS enum-like object.

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'youtube', 'linkedin', 'tiktok'];

const SOCIAL_CONTENT_TYPES = ['image', 'carousel', 'video', 'reel', 'text'];

const SOCIAL_POST_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'REJECTED',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'PARTIALLY_PUBLISHED',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
];

const SOCIAL_APPROVAL_STATUSES = ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'];

const SOCIAL_PUBLISH_JOB_STATUSES = ['PENDING', 'CLAIMED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED'];

const SOCIAL_ACCOUNT_STATUSES = [
  'NOT_CONFIGURED', // developer credentials missing
  'CONNECTED',
  'PERMISSION_REQUIRED',
  'RECONNECT_REQUIRED',
  'DISCONNECTED',
  'ERROR',
];

const SOCIAL_ACCOUNT_TYPES = ['page', 'business', 'creator', 'channel', 'organization', 'profile'];

// Actions recorded in SocialAuditLog — kept as a flat list (not enforced via
// schema enum) so new providers/actions don't require a migration.
const SOCIAL_AUDIT_ACTIONS = [
  'post.created',
  'post.edited',
  'post.deleted',
  'post.submitted',
  'post.approved',
  'post.rejected',
  'post.scheduled',
  'post.reschedule',
  'post.cancelled',
  'post.publishing_started',
  'post.published',
  'post.publish_failed',
  'post.retry',
  'account.connected',
  'account.disconnected',
  'account.token_refreshed',
  'account.validation_failed',
  'platform.error',
];

const isValidPlatform = (platform) => SOCIAL_PLATFORMS.includes(platform);
const isValidPostStatus = (status) => SOCIAL_POST_STATUSES.includes(status);

// Error classification — used by the publishing engine to decide retry vs.
// permanent failure vs. "needs reconnect" vs. "needs permission".
const SOCIAL_ERROR_CLASSES = {
  RECONNECT_REQUIRED: 'RECONNECT_REQUIRED', // 401 / invalid token
  PERMISSION_ERROR: 'PERMISSION_ERROR', // 403 / missing scope
  RATE_LIMITED: 'RATE_LIMITED', // 429
  TRANSIENT: 'TRANSIENT', // 5xx / network
  PERMANENT: 'PERMANENT', // 4xx validation, bad content, etc.
};

function classifyHttpError(status) {
  if (status === 401) return SOCIAL_ERROR_CLASSES.RECONNECT_REQUIRED;
  if (status === 403) return SOCIAL_ERROR_CLASSES.PERMISSION_ERROR;
  if (status === 429) return SOCIAL_ERROR_CLASSES.RATE_LIMITED;
  if (status >= 500) return SOCIAL_ERROR_CLASSES.TRANSIENT;
  if (!status) return SOCIAL_ERROR_CLASSES.TRANSIENT; // network error, no response
  return SOCIAL_ERROR_CLASSES.PERMANENT;
}

module.exports = {
  SOCIAL_PLATFORMS,
  SOCIAL_CONTENT_TYPES,
  SOCIAL_POST_STATUSES,
  SOCIAL_APPROVAL_STATUSES,
  SOCIAL_PUBLISH_JOB_STATUSES,
  SOCIAL_ACCOUNT_STATUSES,
  SOCIAL_ACCOUNT_TYPES,
  SOCIAL_AUDIT_ACTIONS,
  SOCIAL_ERROR_CLASSES,
  isValidPlatform,
  isValidPostStatus,
  classifyHttpError,
};
