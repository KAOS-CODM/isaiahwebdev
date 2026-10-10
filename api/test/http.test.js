'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const health = require('../health');
const sweep = require('../admin/publish/sweep');
const apiNotFound = require('../[...all]');

function stubRes() {
  const headers = new Map();
  return {
    statusCode: 0,
    headers,
    body: '',
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(chunk) {
      this.body = chunk || '';
    },
  };
}

describe('GET /api/health', () => {
  it('returns 200 ok with security headers and no secrets', async () => {
    const res = stubRes();
    await health({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
    assert.equal(res.getHeader('x-frame-options'), 'DENY');
    assert.equal(res.getHeader('cache-control'), 'no-store');
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'isaiahwebdev-api');
    assert.ok(!JSON.stringify(body).toLowerCase().includes('mongodb://'));
  });

  it('rejects non-GET with 405 and Allow header', async () => {
    const res = stubRes();
    await health({ method: 'POST' }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.getHeader('allow'), 'GET');
  });
});

describe('POST /api/admin/publish/sweep', () => {
  it('returns 501 placeholder for POST', async () => {
    const res = stubRes();
    await sweep({ method: 'POST' }, res);
    assert.equal(res.statusCode, 501);
    assert.equal(JSON.parse(res.body).error.code, 'NOT_IMPLEMENTED');
  });

  it('rejects non-POST with 405', async () => {
    const res = stubRes();
    await sweep({ method: 'GET' }, res);
    assert.equal(res.statusCode, 405);
  });
});

describe('catch-all /api/* unknown routes', () => {
  it('returns JSON 404 with safe shape for any method', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const res = stubRes();
      await apiNotFound({ method }, res);
      assert.equal(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'NOT_FOUND');
      assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
      assert.equal(res.getHeader('cache-control'), 'no-store');
    }
  });
});
