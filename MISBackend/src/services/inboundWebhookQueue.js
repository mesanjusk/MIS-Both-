/**
 * Durable inbound webhook retry queue stored inside the existing app_settings
 * collection.
 *
 * Why this lives in app_settings instead of its own collection:
 * this deployment can run on MongoDB plans with a strict collection-count
 * limit. Reusing an existing collection keeps webhook durability and retries
 * without requiring another MongoDB collection to be created.
 */
const crypto = require('crypto');
const { AppSetting } = require('../repositories/appSetting');
const logger = require('../utils/logger');

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60 * 1000;
const QUEUE_KEY = 'system_inbound_webhook_queue';
const QUEUE_DESCRIPTION = 'Durable inbound webhook retry queue stored in app_settings';
const DONE_RETENTION_MS = 24 * 60 * 60 * 1000;
const FAILED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function collection() {
  return AppSetting.collection;
}

function dedupeKeyFor(provider, payload, providerMessageId = '') {
  if (providerMessageId) return `${provider}:${providerMessageId}`;
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  return `${provider}:sha256:${hash}`;
}

async function ensureQueueDocument() {
  await collection().updateOne(
    { key: QUEUE_KEY },
    {
      $setOnInsert: {
        key: QUEUE_KEY,
        value: { events: [] },
        description: QUEUE_DESCRIPTION,
        createdAt: new Date(),
      },
      $set: { updatedAt: new Date() },
    },
    { upsert: true }
  );
}

async function pruneOldEvents() {
  const now = Date.now();
  await collection().updateOne(
    { key: QUEUE_KEY },
    {
      $pull: {
        'value.events': {
          $or: [
            { status: 'done', processed_at: { $lt: new Date(now - DONE_RETENTION_MS) } },
            { status: 'failed', updated_at: { $lt: new Date(now - FAILED_RETENTION_MS) } },
          ],
        },
      },
      $set: { updatedAt: new Date() },
    }
  ).catch((err) => logger.warn(`[webhook-queue] Could not prune old events: ${err.message}`));
}

async function findEventByDedupeKey(dedupeKey) {
  const doc = await collection().findOne(
    { key: QUEUE_KEY, 'value.events.dedupe_key': dedupeKey },
    { projection: { 'value.events.$': 1 } }
  );
  return doc?.value?.events?.[0] || null;
}

async function record({ provider, payload, providerMessageId }) {
  const dedupeKey = dedupeKeyFor(provider, payload, providerMessageId);

  try {
    await ensureQueueDocument();
    await pruneOldEvents();

    const now = new Date();
    const event = {
      _id: crypto.randomUUID(),
      provider,
      dedupe_key: dedupeKey,
      payload,
      status: 'pending',
      attempts: 0,
      last_error: '',
      lease_until: null,
      lease_token: '',
      processed_at: null,
      created_at: now,
      updated_at: now,
    };

    const result = await collection().updateOne(
      {
        key: QUEUE_KEY,
        'value.events': { $not: { $elemMatch: { dedupe_key: dedupeKey } } },
      },
      {
        $push: { 'value.events': event },
        $set: { updatedAt: now },
      }
    );

    if (result.modifiedCount === 1) {
      return { event, duplicate: false, recorded: true };
    }

    const existing = await findEventByDedupeKey(dedupeKey);
    if (existing) return { event: existing, duplicate: true, recorded: true };

    logger.error(`[webhook-queue] Could not record ${provider} delivery: queue document was not updated`);
    return { event: null, duplicate: false, recorded: false };
  } catch (err) {
    logger.error(`[webhook-queue] Could not record ${provider} delivery: ${err.message}`);
    return { event: null, duplicate: false, recorded: false };
  }
}

async function markDone(eventId) {
  if (!eventId) return;
  const now = new Date();
  await collection().updateOne(
    { key: QUEUE_KEY },
    {
      $set: {
        'value.events.$[event].status': 'done',
        'value.events.$[event].processed_at': now,
        'value.events.$[event].lease_until': null,
        'value.events.$[event].lease_token': '',
        'value.events.$[event].last_error': '',
        'value.events.$[event].updated_at': now,
        updatedAt: now,
      },
    },
    { arrayFilters: [{ 'event._id': String(eventId) }] }
  ).catch((err) => logger.error(`[webhook-queue] Could not mark ${eventId} done: ${err.message}`));
}

async function markFailed(eventId, error) {
  if (!eventId) return;

  try {
    const doc = await collection().findOne(
      { key: QUEUE_KEY, 'value.events._id': String(eventId) },
      { projection: { 'value.events.$': 1 } }
    );
    const row = doc?.value?.events?.[0];
    if (!row) return;

    const attempts = Number(row.attempts || 0) + 1;
    const now = new Date();

    await collection().updateOne(
      { key: QUEUE_KEY },
      {
        $set: {
          'value.events.$[event].status': attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          'value.events.$[event].attempts': attempts,
          'value.events.$[event].last_error': String(error?.message || error || '').slice(0, 1000),
          'value.events.$[event].lease_until': null,
          'value.events.$[event].lease_token': '',
          'value.events.$[event].updated_at': now,
          updatedAt: now,
        },
      },
      { arrayFilters: [{ 'event._id': String(eventId) }] }
    );

    if (attempts >= MAX_ATTEMPTS) {
      logger.error(`[webhook-queue] Giving up on ${eventId} after ${attempts} attempts; event retained for inspection.`);
    }
  } catch (err) {
    logger.error(`[webhook-queue] Could not mark ${eventId} failed: ${err.message}`);
  }
}

async function claimNext(provider) {
  await ensureQueueDocument();

  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const leaseToken = crypto.randomUUID();

  const result = await collection().findOneAndUpdate(
    {
      key: QUEUE_KEY,
      'value.events': {
        $elemMatch: {
          provider,
          attempts: { $lt: MAX_ATTEMPTS },
          $or: [
            {
              status: 'pending',
              $or: [
                { lease_until: null },
                { lease_until: { $lt: now } },
              ],
            },
            {
              status: 'processing',
              lease_until: { $lt: now },
            },
          ],
        },
      },
    },
    {
      $set: {
        'value.events.$.status': 'processing',
        'value.events.$.lease_until': leaseUntil,
        'value.events.$.lease_token': leaseToken,
        'value.events.$.updated_at': now,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' }
  );

  // MongoDB driver v6 returns the document directly. Older return shapes wrap
  // it in `{ value: document }`. The app_settings document itself also has a
  // `value` field, so support both without mistaking the setting payload for
  // the whole document.
  const events =
    result?.value?.value?.events ||
    result?.value?.events ||
    result?.events ||
    [];

  return events.find((event) => event.lease_token === leaseToken) || null;
}

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

  if (processed > 0) await pruneOldEvents();
  return processed;
}

module.exports = {
  record,
  markDone,
  markFailed,
  claimNext,
  drain,
  dedupeKeyFor,
  MAX_ATTEMPTS,
  LEASE_MS,
  QUEUE_KEY,
};
