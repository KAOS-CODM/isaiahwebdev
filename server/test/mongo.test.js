'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createMongoPool, toSafeDbError, configurePublicDns, DEFAULT_DNS_SERVERS } = require('../lib/mongo');

function fakeFactory() {
  const state = { calls: 0, clients: [] };
  const factory = async () => {
    state.calls += 1;
    const client = { id: state.calls, closed: false, async close() { this.closed = true; } };
    state.clients.push(client);
    return client;
  };
  return { factory, state };
}

describe('mongo configuration errors', () => {
  it('fails closed with DB_UNCONFIGURED when MONGODB_URI is missing', async () => {
    const pool = createMongoPool({ clientFactory: async () => ({}), env: {} });
    await assert.rejects(pool.getClient(), (err) => err.code === 'DB_UNCONFIGURED');
    assert.equal(pool.isConnected(), false);
  });

  it('fails closed with DB_UNCONFIGURED when MONGODB_URI is blank', async () => {
    const pool = createMongoPool({ clientFactory: async () => ({}), env: { MONGODB_URI: '   ' } });
    await assert.rejects(pool.getDb(), (err) => err.code === 'DB_UNCONFIGURED');
  });

  it('fails closed with DB_URI_INVALID for unparsable URIs', async () => {
    const pool = createMongoPool({ clientFactory: async () => ({}), env: { MONGODB_URI: 'not a uri' } });
    await assert.rejects(pool.getClient(), (err) => err.code === 'DB_URI_INVALID');
  });

  it('fails closed with DB_URI_INVALID for non-mongodb schemes', async () => {
    const pool = createMongoPool({ clientFactory: async () => ({}), env: { MONGODB_URI: 'https://example.com/db' } });
    await assert.rejects(pool.getClient(), (err) => err.code === 'DB_URI_INVALID');
  });

  it('accepts mongodb:// and mongodb+srv:// schemes without connecting', async () => {
    for (const uri of ['mongodb://localhost:27017/portfolio_staging', 'mongodb+srv://u:p@cluster.example/portfolio_staging']) {
      const { factory, state } = fakeFactory();
      const pool = createMongoPool({ clientFactory: factory, env: { MONGODB_URI: uri } });
      await pool.getClient();
      assert.equal(state.calls, 1);
    }
  });
});

describe('mongo connection failures', () => {
  it('does not cache failures and maps them to safe 503 errors', async () => {
    let fail = true;
    const pool = createMongoPool({
      clientFactory: async () => {
        if (fail) {
          const err = new Error('connect ECONNREFUSED db.example:27017 (real stack hidden)');
          err.code = 'ECONNREFUSED';
          throw err;
        }
        return { id: 'recovered' };
      },
      env: { MONGODB_URI: 'mongodb://localhost:27017/portfolio_staging' },
    });
    const err = await pool.getClient().then(() => null, (e) => e);
    assert.ok(err);
    const safe = toSafeDbError(err);
    assert.equal(safe.status, 503);
    assert.equal(safe.code, 'DB_UNAVAILABLE');
    assert.ok(!safe.message.includes('ECONNREFUSED'));
    fail = false;
    assert.equal((await pool.getClient()).id, 'recovered');
  });

  it('toSafeDbError never leaks URIs or stacks', () => {
    for (const err of [
      Object.assign(new Error('mongodb+srv://admin:s3cret@cluster/db failed'), { code: 'ENOTFOUND' }),
      Object.assign(new Error('bad config'), { code: 'DB_UNCONFIGURED' }),
    ]) {
      const safe = JSON.stringify(toSafeDbError(err));
      assert.ok(!safe.includes('s3cret'));
      assert.ok(!safe.includes('mongodb'));
      assert.ok(!safe.includes('at '));
    }
  });
});

describe('dns configuration', () => {
  it('pins public resolvers for Atlas SRV lookups', () => {
    assert.deepEqual([...DEFAULT_DNS_SERVERS], ['8.8.8.8', '1.1.1.1']);
  });

  it('configurePublicDns delegates to the given resolver without network calls', () => {
    const seen = [];
    const fakeResolver = { setServers(servers) { seen.push([...servers]); } };
    const result = configurePublicDns(fakeResolver);
    assert.deepEqual(seen, [['8.8.8.8', '1.1.1.1']]);
    assert.deepEqual([...result], ['8.8.8.8', '1.1.1.1']);
  });

  it('configurePublicDns accepts explicit servers', () => {
    const seen = [];
    const fakeResolver = { setServers(servers) { seen.push([...servers]); } };
    configurePublicDns(fakeResolver, ['9.9.9.9']);
    assert.deepEqual(seen, [['9.9.9.9']]);
  });
});

describe('mongo connection success and reuse', () => {
  it('caches one client across sequential and concurrent calls', async () => {
    const { factory, state } = fakeFactory();
    const pool = createMongoPool({ clientFactory: factory, env: { MONGODB_URI: 'mongodb://localhost:27017/portfolio_staging' } });
    const [a, b] = await Promise.all([pool.getClient(), pool.getClient()]);
    assert.equal(a, b);
    await pool.getClient();
    assert.equal(state.calls, 1);
    assert.equal(pool.isConnected(), true);
  });

  it('getDb delegates to the cached client db()', async () => {
    const dbHandle = { fake: 'db' };
    const pool = createMongoPool({
      clientFactory: async () => ({ db: () => dbHandle }),
      env: { MONGODB_URI: 'mongodb://localhost:27017/portfolio_staging' },
    });
    assert.equal(await pool.getDb(), dbHandle);
  });
});
