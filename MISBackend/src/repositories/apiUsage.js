const mongoose = require('mongoose');

/**
 * One row per API endpoint, counting how often it is called and how well it
 * performs.
 *
 * Keyed by the route *template* (`GET /api/orders/:id`), never the requested
 * URL — otherwise every order id would get its own row and the collection
 * would grow without bound while telling you nothing.
 *
 * This exists because nothing recorded API usage before it. Render's plan
 * keeps only application and build logs, no request logs, so "which endpoints
 * has nobody called in 45 days" had no answer anywhere. It has one from the
 * day this ships, and a truthful one 45 days later.
 *
 * Durations are summed rather than averaged on write: an average cannot be
 * merged with another average without the counts, and the counts are what
 * `$inc` can do atomically from several instances at once.
 */
const ApiUsageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    method: { type: String, required: true },
    path: { type: String, required: true },

    hits: { type: Number, default: 0 },
    firstSeenAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: null, index: true },

    // Milliseconds. `avg = totalMs / hits`, computed on read.
    totalMs: { type: Number, default: 0 },
    maxMs: { type: Number, default: 0 },

    status2xx: { type: Number, default: 0 },
    status3xx: { type: Number, default: 0 },
    status4xx: { type: Number, default: 0 },
    status5xx: { type: Number, default: 0 },
    lastStatus: { type: Number, default: null },
  },
  { timestamps: true, collection: 'api_usage' }
);

module.exports = mongoose.model('ApiUsage', ApiUsageSchema);
