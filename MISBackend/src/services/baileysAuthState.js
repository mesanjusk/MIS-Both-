/**
 * MongoDB-backed Baileys auth state adapter for MIS project.
 *
 * Keeps an in-memory write-through cache so key lookups during
 * the QR handshake (synchronous bursts) never lag on DB round-trips.
 */

const BaileysAuthState = require('../repositories/BaileysAuthState');

const CREDS_KEY  = 'baileys_creds';
const KEY_PREFIX = 'baileys_key_';

// In-memory cache — write-through, cleared on disconnect
const memCache = new Map();

// ── low-level DB helpers ──────────────────────────────────────────────────────

async function dbRead(key) {
  if (memCache.has(key)) return memCache.get(key);
  const doc = await BaileysAuthState.findOne({ dataKey: key }).lean();
  const val = doc ? doc.dataValue : null;
  if (val !== null) memCache.set(key, val);
  return val;
}

async function dbWrite(key, value) {
  memCache.set(key, value);
  await BaileysAuthState.findOneAndUpdate(
    { dataKey: key },
    { $set: { dataValue: value } },
    { upsert: true }
  );
}

async function dbDelete(key) {
  memCache.delete(key);
  await BaileysAuthState.deleteOne({ dataKey: key });
}

// ── main export ───────────────────────────────────────────────────────────────

async function useMongoAuthState() {
  // Lazy-import so server boots even if baileys isn't installed yet
  const { initAuthCreds, BufferJSON } = await import('@whiskeysockets/baileys');

  // ── credentials (one document) ─────────────────────────────────────────────
  let rawCreds = await dbRead(CREDS_KEY);
  let creds;

  if (!rawCreds) {
    creds = initAuthCreds();
    await dbWrite(CREDS_KEY, JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
  } else {
    creds = JSON.parse(JSON.stringify(rawCreds), BufferJSON.reviver);
  }

  // ── signal keys ───────────────────────────────────────────────────────────
  const keys = {
    get: async (type, ids) => {
      const result = {};
      await Promise.all(
        ids.map(async (id) => {
          const dbKey = `${KEY_PREFIX}${type}_${id}`;
          const raw   = await dbRead(dbKey);
          if (raw == null) return;
          result[id] = JSON.parse(JSON.stringify(raw), BufferJSON.reviver);
        })
      );
      return result;
    },

    set: async (data) => {
      const writes = [];
      for (const [type, idMap] of Object.entries(data)) {
        for (const [id, value] of Object.entries(idMap ?? {})) {
          const dbKey = `${KEY_PREFIX}${type}_${id}`;
          if (value != null) {
            writes.push(
              dbWrite(dbKey, JSON.parse(JSON.stringify(value, BufferJSON.replacer)))
            );
          } else {
            writes.push(dbDelete(dbKey));
          }
        }
      }
      await Promise.all(writes);
    },
  };

  const saveCreds = async () => {
    await dbWrite(CREDS_KEY, JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
  };

  return { state: { creds, keys }, saveCreds };
}

async function clearMongoAuthState() {
  memCache.clear();
  await BaileysAuthState.deleteMany({ dataKey: CREDS_KEY });
  await BaileysAuthState.deleteMany({ dataKey: { $regex: `^${KEY_PREFIX}` } });
}

module.exports = { useMongoAuthState, clearMongoAuthState };
