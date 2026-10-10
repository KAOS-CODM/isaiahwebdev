'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ensureSchema } = require('../lib/migrate');

/** In-memory Db-handle double. Records every mutating call for assertions. */
function fakeDb({ collections = {}, indexes = {} } = {}) {
  const calls = { createCollection: [], createIndex: [], dropCollection: [], deleteMany: [], deleteOne: [] };
  return {
    calls,
    async *listCollections() {
      for (const name of Object.keys(collections)) yield { name };
    },
    async createCollection(name) {
      calls.createCollection.push(name);
      collections[name] = true;
      indexes[name] = indexes[name] || [];
    },
    collection(name) {
      return {
        async indexes() {
          return (indexes[name] || []).map((idxName) => ({ name: idxName }));
        },
        async createIndex(keys, options) {
          calls.createIndex.push(`${name}.${options.name}`);
          (indexes[name] = indexes[name] || []).push(options.name);
          return options.name;
        },
      };
    },
  };
}

describe('schema initialization', () => {
  it('creates missing collections and indexes on first run', async () => {
    const db = fakeDb();
    const report = await ensureSchema(db);
    assert.deepEqual(report.createdCollections.sort(), ['Admin', 'PublishJob', 'RateLimit', 'Session']);
    assert.equal(report.createdIndexes.length, 7);
    assert.ok(report.createdIndexes.includes('RateLimit.ttl_expiresAt'));
    assert.ok(report.createdIndexes.includes('PublishJob.uniq_idempotencyKey'));
    assert.ok(report.createdIndexes.includes('Admin.uniq_username'));
    assert.ok(report.createdIndexes.includes('Session.uniq_tokenHash'));
    assert.ok(report.createdIndexes.includes('Session.ttl_expiresAt'));
  });

  it('is repeatable: second run changes nothing', async () => {
    const db = fakeDb();
    await ensureSchema(db);
    const second = await ensureSchema(db);
    assert.deepEqual(second.createdCollections, []);
    assert.deepEqual(second.createdIndexes, []);
    assert.deepEqual(second.existingCollections.sort(), ['Admin', 'PublishJob', 'RateLimit', 'Session']);
  });

  it('never drops collections or deletes documents', async () => {
    const db = fakeDb({ collections: { RateLimit: true }, indexes: { RateLimit: ['ttl_expiresAt'] } });
    await ensureSchema(db);
    await ensureSchema(db);
    assert.deepEqual(db.calls.dropCollection, []);
    assert.deepEqual(db.calls.deleteMany, []);
    assert.deepEqual(db.calls.deleteOne, []);
    assert.ok(!db.calls.createCollection.includes('RateLimit'));
    assert.ok(db.calls.createCollection.includes('PublishJob'));
  });

  it('adds only indexes that are missing', async () => {
    const db = fakeDb({
      collections: { PublishJob: true },
      indexes: { PublishJob: ['uniq_idempotencyKey'] },
    });
    const report = await ensureSchema(db);
    assert.ok(!report.createdIndexes.includes('PublishJob.uniq_idempotencyKey'));
    assert.ok(report.createdIndexes.includes('PublishJob.idx_status_updatedAt'));
  });

  it('rejects handles without listCollections()', async () => {
    await assert.rejects(ensureSchema({}), TypeError);
    await assert.rejects(ensureSchema(null), TypeError);
  });
});
