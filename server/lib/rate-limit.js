'use strict';

/**
 * lib/rate-limit.js — window-bucketed login rate limiter (Gate 0).
 *
 * The threshold decision and the increment happen in a single store call, so
 * concurrent serverless instances cannot all observe a stale count and pass.
 * Time is injected (`now`) for deterministic tests. Store failures propagate
 * as `RateLimitError(code='STORE_UNAVAILABLE')` so HTTP layers fail closed.
 *
 * Semantics: `maxFailures` failures are recorded; the next attempt inside the
 * same window is rejected. With maxFailures=5: attempts 1-5 allowed, 6th rejected.
 */

const crypto = require('node:crypto');

class RateLimitError extends Error {
  constructor(message = 'Rate-limit store unavailable.') {
    super(message);
    this.name = 'RateLimitError';
    this.code = 'STORE_UNAVAILABLE';
  }
}

function hashSubject(subject, pepper) {
  return crypto.createHash('sha256').update(`${pepper}:${subject}`).digest('hex');
}

function createRateLimiter({ store, windowMs, maxFailures }) {
  if (!store || typeof store.add !== 'function') {
    throw new TypeError('createRateLimiter requires a store with an async add(bucketId, ttlMs) method.');
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new TypeError('windowMs must be a positive integer.');
  }
  if (!Number.isInteger(maxFailures) || maxFailures < 1) {
    throw new TypeError('maxFailures must be a positive integer.');
  }

  return {
    async checkAndRecord({ subject, now = Date.now() }) {
      const key = String(subject);
      if (key.length === 0) throw new TypeError('subject must be a non-empty string.');
      const windowId = Math.floor(now / windowMs);
      const bucketId = `${windowId}:${key}`;
      let count;
      try {
        count = await store.add(bucketId, windowMs * 2);
      } catch (err) {
        if (err instanceof RateLimitError) throw err;
        throw new RateLimitError();
      }
      if (!Number.isInteger(count) || count < 1) throw new RateLimitError();
      if (count > maxFailures) {
        return { allowed: false, count, retryAfterMs: (windowId + 1) * windowMs - now };
      }
      return { allowed: true, count, retryAfterMs: 0 };
    },

    async reset({ subject, now = Date.now() }) {
      const windowId = Math.floor(now / windowMs);
      await store.remove(`${windowId}:${String(subject)}`);
    },
  };
}

/**
 * In-memory store. The increment path performs no awaiting between read and
 * write, so concurrent callers within one process cannot interleave.
 */
function createMemoryStore() {
  const buckets = new Map();
  function purge(now) {
    for (const [id, entry] of buckets) {
      if (entry.expiresAt <= now) buckets.delete(id);
    }
  }
  return {
    async add(bucketId, ttlMs) {
      const now = Date.now();
      purge(now);
      const entry = buckets.get(bucketId);
      if (entry) {
        entry.count += 1;
        return entry.count;
      }
      buckets.set(bucketId, { count: 1, expiresAt: now + ttlMs });
      return 1;
    },
    async remove(bucketId) {
      buckets.delete(bucketId);
    },
    __size() {
      purge(Date.now());
      return buckets.size;
    },
  };
}

/**
 * Atlas store adapter. Requires a collection handle exposing
 * `findOneAndUpdate(filter, update, options)` (native driver shape).
 * Atomicity comes from the single-document upsert. A TTL index on
 * `expiresAt` must exist (created by Gate 1 migration, staging-verified).
 *
 * Gate 0 ships the adapter untested against a live database; live
 * verification is an explicit staging acceptance item.
 */
function createAtlasStore(collection, { ttlSeconds = 1800 } = {}) {
  if (!collection || typeof collection.findOneAndUpdate !== 'function') {
    throw new TypeError('createAtlasStore requires a collection with findOneAndUpdate().');
  }
  return {
    async add(bucketId, ttlMs) {
      const ttl = Math.max(60, Math.ceil(ttlMs / 1000));
      void ttlSeconds;
      const res = await collection.findOneAndUpdate(
        { _id: bucketId },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(Date.now() + ttlMs) },
        },
        { upsert: true, returnDocument: 'after' }
      );
      const doc = res && res.value ? res.value : res;
      if (!doc || !Number.isInteger(doc.count)) throw new RateLimitError();
      return doc.count;
    },
    async remove(bucketId) {
      await collection.deleteOne({ _id: bucketId });
    },
  };
}

module.exports = {
  RateLimitError,
  hashSubject,
  createRateLimiter,
  createMemoryStore,
  createAtlasStore,
};
