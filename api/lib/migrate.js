'use strict';

/**
 * lib/migrate.js — safe, repeatable schema initialization (Gate 1).
 *
 * Rules (see docs/GATE1_MIGRATION.md):
 * - Creates collections/indexes that are missing; never drops, deletes, or
 *   overwrites collections, documents, or indexes.
 * - Fully repeatable: running twice yields `{ createdCollections: [], ... }`
 *   on the second run with no changes.
 * - Operates only on the database handle it is given (staging wiring points
 *   that at `portfolio_staging`); it never selects or switches databases.
 */

const REQUIRED_COLLECTIONS = Object.freeze({
  RateLimit: {
    indexes: [{ keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_expiresAt' } }],
  },
  PublishJob: {
    indexes: [
      { keys: { idempotencyKey: 1 }, options: { unique: true, name: 'uniq_idempotencyKey' } },
      { keys: { status: 1, updatedAt: 1 }, options: { name: 'idx_status_updatedAt' } },
    ],
  },
});

async function ensureSchema(db) {
  if (!db || typeof db.listCollections !== 'function') {
    throw new TypeError('ensureSchema requires a Db handle with listCollections().');
  }
  const existing = new Set();
  const cursor = db.listCollections({}, { nameOnly: true });
  for await (const info of cursor) {
    existing.add(info.name);
  }

  const report = { createdCollections: [], createdIndexes: [], existingCollections: [] };
  for (const [name, spec] of Object.entries(REQUIRED_COLLECTIONS)) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      report.createdCollections.push(name);
    } else {
      report.existingCollections.push(name);
    }
    const collection = db.collection(name);
    const current = new Set((await collection.indexes()).map((idx) => idx.name));
    for (const { keys, options } of spec.indexes) {
      if (!current.has(options.name)) {
        await collection.createIndex(keys, options);
        report.createdIndexes.push(`${name}.${options.name}`);
      }
    }
  }
  return report;
}

module.exports = { ensureSchema, REQUIRED_COLLECTIONS };
