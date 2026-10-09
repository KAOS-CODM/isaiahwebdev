'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createConnector } = require('../lib/db');

function fakeDriver() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async connect() {
      calls += 1;
      return { fake: 'connection' };
    },
  };
}

describe('db connector', () => {
  it('requires a driver with connect()', () => {
    assert.throws(() => createConnector({ driver: {}, uri: 'x' }), TypeError);
  });

  it('caches one connection across calls, including concurrent', async () => {
    const driver = fakeDriver();
    const c = createConnector({ driver, uri: 'mongodb://staging/x' });
    assert.equal(c.isConnected(), false);
    const [a, b] = await Promise.all([c.connect(), c.connect()]);
    assert.equal(a, b);
    assert.equal(driver.calls, 1);
    assert.equal(c.isConnected(), true);
    await c.connect();
    assert.equal(driver.calls, 1);
  });

  it('fails closed with DB_UNCONFIGURED when no URI is set', async () => {
    const c = createConnector({ driver: fakeDriver(), uri: '' });
    await assert.rejects(c.connect(), (err) => err.code === 'DB_UNCONFIGURED');
    assert.equal(c.isConnected(), false);
  });

  it('does not cache failures; retry reconnects', async () => {
    let fail = true;
    const driver = {
      async connect() {
        if (fail) throw new Error('down');
        return { fake: 'connection' };
      },
    };
    const c = createConnector({ driver, uri: 'mongodb://staging/x' });
    await assert.rejects(c.connect(), /down/);
    assert.equal(c.isConnected(), false);
    fail = false;
    const conn = await c.connect();
    assert.equal(conn.fake, 'connection');
  });
});
