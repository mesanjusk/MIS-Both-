const SocialAuditLog = require('../../repositories/SocialAuditLog');
const logger = require('../../utils/logger');

/**
 * recordAuditEvent — fire-and-forget audit trail write. Never throws into
 * the caller's request flow; logging failures are logged, not propagated,
 * so a broken audit write can't block a publish/approve/etc. action.
 */
async function recordAuditEvent({
  action,
  entityType,
  entityId,
  platform = null,
  actor = null,
  actorName = null,
  oldValue = null,
  newValue = null,
  detail = '',
  req = null,
}) {
  try {
    await SocialAuditLog.create({
      action,
      entityType,
      entityId,
      platform,
      actor,
      actorName,
      oldValue,
      newValue,
      detail,
      ip: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  } catch (error) {
    logger.error({ err: error.message, action, entityType, entityId }, '[social] Failed to write audit log');
  }
}

module.exports = { recordAuditEvent };
