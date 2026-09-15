/**
 * Record an inbound webhook delivery before acknowledging it, and retry the
 * processing until it succeeds.
 *
 * Acknowledging first and processing afterwards means any failure after the
 * 200 loses the delivery permanently — the sender has been told it worked and
 * will not send it again. Recording first turns the 200 into a promise this
 * server can keep.
 */
const crypto = require('crypto');
const InboundWebhookEvent = require('../repositories/inboundWebhookEvent');
const logger = require('../utils/logger');

// Give up after this many attempts; the row stays for inspection.
const MAX_ATTEMPTS = 5;

// How long a worker may hold a row before another may retry it.
const LEASE_MS = 2 * 60 * 1000;

/**
 * A stable identity for a delivery: the provider's own message id when there
 * is one, otherwise a hash of the payload so an identical retry still collapses
 * onto one row.
 */
function dedupeKeyFor(provider, payload, providerMessageId = '') {
  if (providerMessageId) return `${provider}:${providerMessageId}`;
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  return `${provider}:sha256:${hash}`;
}

/**
 * Store the delivery. Safe to call twice for the same delivery: the second call
 * returns the existing row rather than creating another.
 *
 * @returns {Promise<{event: object|null, duplicate: boolean, recorded: boolean}>}
 *   `recorded` is false when the row could not be written at all, which is the
 *   one case the caller must not answer 200 to.
 */
async function record({ provider, payload, providerMessageId }) {
  const dedupeKey = dedupeKeyFor(provider, payload, providerMessageId);

  try {
    const event = await InboundWebhookEvent.create({
      provider,
      dedupe_key: dedupeKey,
      payload,
      status: 'pending',
    });
    return { event, duplicate: false, recorded: true };
  } catch (err) {
    if (err.code === 11000 || err.code === 11001) {
      const existing = await InboundWebhookEvent.findOne({ dedupe_key: dedupeKey }).lean();
      return { event: existing, duplicate: true, recorded: true };
    }
    logger.error(`[webhook-queue] Could not record ${provider} delivery: ${err.message}`);
    return { event: null, duplicate: false, recorded: false };
  }
}

/** Mark a row finished. */
async function markDone(eventId) {
  if (!eventId) return;
  await InboundWebhookEvent.updateOne(
    { _id: eventId },
    { $set: { status: 'done', processed_at: new Date(), lease_until: null, last_error: '' } }
  ).catch((err) => logger.error(`[webhook-queue] Could not mark ${eventId} done: ${err.message}`));
}

/**
 * Record a failed attempt. The row goes back to pending — and so is retried —
 * until it has been tried MAX_ATTEMPTS times.
 */
async function markFailed(eventId, error) {
  if (!eventId) return;
  const row = await InboundWebhookEvent.findById(eventId).lean().catch(() => null);
  const attempts = Number(row?.attempts || 0) + 1;

  await InboundWebhookEvent.updateOne(
    { _id: eventId },
    {
      $set: {
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        last_error: String(error?.message || error || '').slice(0, 1000),
        lease_until: null,
      },
      $inc: { attempts: 1 },
    }
  ).catch((err) => logger.error(`[webhook-queue] Could not mark ${eventId} failed: ${err.message}`));

  if (attempts >= MAX_ATTEMPTS) {
    logger.error(
      `[webhook-queue] Giving up on ${eventId} after ${attempts} attempts; the row is kept for inspection.`
    );
  }
}

/**
 * Claim one row to work on.
 *
 * The claim is a single atomic findOneAndUpdate that both selects the row and
 * takes its lease, so two workers cannot claim the same delivery.
 */
async function claimNext(provider) {
  const now = new Date();
  return InboundWebhookEvent.findOneAndUpdate(
    {
      provider,
      status: 'pending',
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [{ lease_until: null }, { lease_until: { $lt: now } }],
    },
    { $set: { status: 'processing', lease_until: new Date(now.getTime() + LEASE_MS) } },
    { sort: { createdAt: 1 }, new: true }
  ).lean();
}

/**
 * Re-run deliveries that have not been processed yet.
 *
 * @param {string} provider
 * @param {(payload: object) => Promise<void>} handler
 * @param {number} [limit] most rows to work through in one sweep
 */
async function drain(provider, handler, limit = 25) {
  let processed = 0;

  for (let i = 0; i < limit; i += 1) {
    const event = await claimNext(provider);
    if (!event) break;

    try {
      await handler(event.payload);
      await markDone(event._id);
      processed += 1;
    } catch (err) {
      logger.error(`[webhook-queue] Retry of ${event._id} failed: ${err.message}`);
      await markFailed(event._id, err);
    }
  }

  return processed;
}

module.exports = { record, markDone, markFailed, claimNext, drain, dedupeKeyFor, MAX_ATTEMPTS, LEASE_MS };
