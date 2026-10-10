'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { hashPassword, verifyPassword } = require('../lib/password');
const { createSession, findSession, revokeSession, revokeAllForAdmin, SESSION_TTL_MS } = require('../lib/sessions');
const { createRateLimiter, createMemoryStore, hashSubject } = require('../lib/rate-limit');
const { loginRoute, logoutRoute, meRoute } = require('../lib/auth-service');
const { bootstrapAdmin } = require('../lib/admin-bootstrap');

const T0 = 1_700_000_000_000;

/* ---------- fakes ---------- */

function fakeDb() {
  const data = { Admin: new Map(), Session: new Map(), RateLimit: new Map() };
  let seq = 0;
  function matches(doc, filter) {
    return Object.entries(filter || {}).every(([k, v]) => doc[k] === v);
  }
  function collection(name) {
    const store = data[name] || (data[name] = new Map());
    return {
      async findOne(filter) {
        for (const doc of store.values()) if (matches(doc, filter)) return { ...doc };
        return null;
      },
      async insertOne(doc) {
        const copy = { ...doc };
        if (copy._id === undefined) copy._id = `id-${++seq}`;
        store.set(copy._id, copy);
        return { insertedId: copy._id };
      },
      async updateOne(filter, update) {
        for (const [id, doc] of store) {
          if (matches(doc, filter)) {
            store.set(id, { ...doc, ...(update.$set || {}) });
            return { matchedCount: 1, modifiedCount: 1 };
          }
        }
        return { matchedCount: 0, modifiedCount: 0 };
      },
      async updateMany(filter, update) {
        let n = 0;
        for (const [id, doc] of store) {
          if (matches(doc, filter)) {
            store.set(id, { ...doc, ...(update.$set || {}) });
            n += 1;
          }
        }
        return { matchedCount: n, modifiedCount: n };
      },
      async deleteOne(filter) {
        for (const [id, doc] of store) {
          if (matches(doc, filter)) {
            store.delete(id);
            return { deletedCount: 1 };
          }
        }
        return { deletedCount: 0 };
      },
    };
  }
  return { collection, __data: data };
}

const fakeHasher = {
  async hash(pw) {
    return `hash:${pw}`;
  },
  async verify(pw, hash) {
    return hash === `hash:${pw}`;
  },
};

function stubRes() {
  const headers = new Map();
  const multi = new Map();
  return {
    statusCode: 0,
    headers,
    body: '',
    setHeader(name, value) {
      const key = name.toLowerCase();
      headers.set(key, value);
      multi.set(key, (multi.get(key) || []).concat(value));
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    getHeaders(name) {
      return multi.get(name.toLowerCase()) || [];
    },
    end(chunk) {
      this.body = chunk || '';
    },
  };
}

function stubReq({ method = 'POST', headers = {}, body = '', ip = '10.0.0.1' } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = { ...headers };
  req.socket = { remoteAddress: ip };
  process.nextTick(() => {
    if (body) req.emit('data', Buffer.from(body));
    req.emit('end');
  });
  return req;
}

function jsonReq(bodyObj, extra = {}) {
  return stubReq({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(extra.headers || {}) },
    body: JSON.stringify(bodyObj),
    ip: extra.ip || '10.0.0.1',
  });
}

function testDeps(db, overrides = {}) {
  const limiter = createRateLimiter({ store: createMemoryStore(), windowMs: 15 * 60 * 1000, maxFailures: 5 });
  return {
    db,
    getDb: async () => {
      if (!db) throw new Error('connect ECONNREFUSED');
      return db;
    },
    hasher: fakeHasher,
    pepper: 'test-pepper',
    publicSiteUrl: '',
    now: () => T0,
    buildLimiter: () => limiter,
    ...overrides,
  };
}

async function seedAdmin(db) {
  await db.collection('Admin').insertOne({ _id: 'admin1', username: 'root', passwordHash: 'hash:s3cret-long-password' });
}

async function loginAs(db, deps, password = 's3cret-long-password') {
  const res = stubRes();
  await loginRoute(jsonReq({ username: 'root', password }), res, deps || testDeps(db));
  return res;
}

function cookieOf(res) {
  return res.getHeader('set-cookie') || '';
}

/* ---------- password ---------- */

describe('password hashing (real bcrypt)', () => {
  it('round-trips and rejects wrong passwords without throwing', async () => {
    const hash = await hashPassword('correct horse battery staple', 4);
    assert.equal(await verifyPassword('correct horse battery staple', hash), true);
    assert.equal(await verifyPassword('wrong password', hash), false);
    assert.equal(await verifyPassword('x', 'not-a-hash'), false);
    assert.equal(await verifyPassword(null, hash), false);
    assert.ok(!hash.includes('correct horse'));
  });
});

/* ---------- sessions ---------- */

describe('sessions', () => {
  it('create → find round-trip', async () => {
    const db = fakeDb();
    const created = await createSession(db, 'admin1', { now: T0 });
    assert.ok(created.token.length >= 32);
    assert.ok(created.csrfToken.length >= 32);
    assert.notEqual(created.token, created.csrfToken);
    const found = await findSession(db, created.token, { now: T0 });
    assert.equal(found.adminId, 'admin1');
    assert.ok(!('token' in found));
  });

  it('expired sessions are invisible', async () => {
    const db = fakeDb();
    const created = await createSession(db, 'admin1', { now: T0 });
    assert.equal(await findSession(db, created.token, { now: T0 + SESSION_TTL_MS + 1 }), null);
  });

  it('revoked sessions are invisible; revoke-all covers all', async () => {
    const db = fakeDb();
    const a = await createSession(db, 'admin1', { now: T0 });
    const b = await createSession(db, 'admin1', { now: T0 });
    await revokeSession(db, a.token);
    assert.equal(await findSession(db, a.token, { now: T0 }), null);
    assert.ok(await findSession(db, b.token, { now: T0 }));
    await revokeAllForAdmin(db, 'admin1');
    assert.equal(await findSession(db, b.token, { now: T0 }), null);
  });

  it('unknown or empty tokens return null', async () => {
    const db = fakeDb();
    assert.equal(await findSession(db, 'nope', { now: T0 }), null);
    assert.equal(await findSession(db, '', { now: T0 }), null);
  });
});

/* ---------- login ---------- */

describe('login route', () => {
  it('succeeds with cookie, csrf token, and no secret material in body', async () => {
    const db = fakeDb();
    await seedAdmin(db);
    const res = await loginAs(db);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.username, 'root');
    assert.ok(body.data.csrfToken.length >= 32);
    assert.ok(body.data.expiresAt);
    assert.ok(!('password' in body.data));
    assert.ok(!('passwordHash' in body.data));
    assert.ok(!JSON.stringify(body).includes('s3cret'));
    const cookie = cookieOf(res);
    assert.ok(cookie.includes('session='));
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('Secure'));
    assert.ok(cookie.includes('SameSite=Lax'));
  });

  it('wrong password and unknown user yield identical generic 401s', async () => {
    const db = fakeDb();
    await seedAdmin(db);
    const deps = testDeps(db);
    const wrong = stubRes();
    await loginRoute(jsonReq({ username: 'root', password: 'nope-not-long-enough-password' }), wrong, deps);
    const unknown = stubRes();
    await loginRoute(jsonReq({ username: 'ghost', password: 'nope-not-long-enough-password' }), unknown, testDeps(db));
    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.body, unknown.body);
    assert.deepEqual(JSON.parse(wrong.body), { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' } });
  });

  it('rejects the 6th rapid attempt with 429 and Retry-After', async () => {
    const db = fakeDb();
    await seedAdmin(db);
    const deps = testDeps(db);
    let last;
    for (let n = 0; n < 6; n += 1) {
      last = stubRes();
      await loginRoute(jsonReq({ username: 'root', password: 'wrong-password-attempt' }), last, deps);
    }
    assert.equal(last.statusCode, 429);
    assert.equal(JSON.parse(last.body).error.code, 'RATE_LIMITED');
    assert.ok(Number(last.getHeader('retry-after')) > 0);
  });

  it('fails closed with 503 when the rate-limit store is down', async () => {
    const db = fakeDb();
    await seedAdmin(db);
    const broken = { async add() { throw new Error('down'); }, async remove() {} };
    const deps = testDeps(db, {
      buildLimiter: () => createRateLimiter({ store: broken, windowMs: 60000, maxFailures: 5 }),
    });
    const res = stubRes();
    await loginRoute(jsonReq({ username: 'root', password: 's3cret-long-password' }), res, deps);
    assert.equal(res.statusCode, 503);
  });

  it('fails closed with 503 when the database is down', async () => {
    const deps = testDeps(null);
    const res = stubRes();
    await loginRoute(jsonReq({ username: 'root', password: 's3cret-long-password' }), res, deps);
    assert.equal(res.statusCode, 503);
    assert.ok(!res.body.includes('ECONNREFUSED'));
  });

  it('validates method, content type, JSON, size, and fields', async () => {
    const db = fakeDb();
    const deps = () => testDeps(db);
    const get = stubRes();
    await loginRoute({ method: 'GET', headers: {}, socket: {} }, get, deps());
    assert.equal(get.statusCode, 405);

    const ct = stubRes();
    await loginRoute(stubReq({ headers: { 'content-type': 'text/plain' }, body: '{}' }), ct, deps());
    assert.equal(ct.statusCode, 415);

    const bad = stubRes();
    await loginRoute(stubReq({ headers: { 'content-type': 'application/json' }, body: '{oops' }), bad, deps());
    assert.equal(bad.statusCode, 400);

    const big = stubRes();
    await loginRoute(
      stubReq({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'root', password: 'x'.repeat(20000) }) }),
      big,
      deps()
    );
    assert.equal(big.statusCode, 413);

    const missing = stubRes();
    await loginRoute(jsonReq({ username: 'root' }), missing, deps());
    assert.equal(missing.statusCode, 400);
  });
});

/* ---------- logout / me / csrf ---------- */

describe('logout, session inspection, and CSRF', () => {
  async function authed() {
    const db = fakeDb();
    await seedAdmin(db);
    const deps = testDeps(db);
    const loginRes = await loginAs(db, deps);
    const csrf = JSON.parse(loginRes.body).data.csrfToken;
    return { db, deps, cookie: cookieOf(loginRes), csrf };
  }

  it('me returns the session identity', async () => {
    const { db, deps, cookie } = await authed();
    const res = stubRes();
    await meRoute({ method: 'GET', headers: { cookie }, socket: {} }, res, deps);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).data.username, 'root');
    void db;
  });

  it('me rejects missing, expired, and revoked sessions', async () => {
    const { db, deps, cookie, csrf } = await authed();
    const none = stubRes();
    await meRoute({ method: 'GET', headers: {}, socket: {} }, none, deps);
    assert.equal(none.statusCode, 401);

    const logoutRes = stubRes();
    await logoutRoute(
      { method: 'POST', headers: { cookie, 'x-csrf-token': csrf }, socket: {}, on() {}, destroy() {} },
      logoutRes,
      deps
    );
    assert.equal(logoutRes.statusCode, 200);
    const after = stubRes();
    await meRoute({ method: 'GET', headers: { cookie }, socket: {} }, after, deps);
    assert.equal(after.statusCode, 401);

    const db2 = fakeDb();
    await seedAdmin(db2);
    const deps2 = testDeps(db2, { now: () => T0 + SESSION_TTL_MS + 1000 });
    const loginRes = await loginAs(db2, testDeps(db2));
    const expired = stubRes();
    await meRoute({ method: 'GET', headers: { cookie: cookieOf(loginRes) }, socket: {} }, expired, deps2);
    assert.equal(expired.statusCode, 401);
    void db;
  });

  it('logout clears the cookie and rejects bad CSRF', async () => {
    const { deps, cookie, csrf } = await authed();
    const bad = stubRes();
    await logoutRoute(
      { method: 'POST', headers: { cookie, 'x-csrf-token': 'wrong' }, socket: {}, on() {}, destroy() {} },
      bad,
      deps
    );
    assert.equal(bad.statusCode, 403);

    const missing = stubRes();
    await logoutRoute(
      { method: 'POST', headers: { cookie }, socket: {}, on() {}, destroy() {} },
      missing,
      deps
    );
    assert.equal(missing.statusCode, 403);

    const ok = stubRes();
    await logoutRoute(
      { method: 'POST', headers: { cookie, 'x-csrf-token': csrf }, socket: {}, on() {}, destroy() {} },
      ok,
      deps
    );
    assert.equal(ok.statusCode, 200);
    assert.ok(ok.getHeader('set-cookie').includes('Max-Age=0'));
  });

  it('rejects mismatched Origin against the configured site', async () => {
    const { db, cookie, csrf } = await authed();
    const deps = testDeps(db, { publicSiteUrl: 'https://cms.example' });
    const res = stubRes();
    await logoutRoute(
      { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, origin: 'https://evil.example' }, socket: {}, on() {}, destroy() {} },
      res,
      deps
    );
    assert.equal(res.statusCode, 403);
  });

  it('rejects wrong methods on logout and me', async () => {
    const { deps } = await authed();
    const a = stubRes();
    await logoutRoute({ method: 'GET', headers: {}, socket: {} }, a, deps);
    assert.equal(a.statusCode, 405);
    const b = stubRes();
    await meRoute({ method: 'POST', headers: {}, socket: {} }, b, deps);
    assert.equal(b.statusCode, 405);
  });

  it('treats malformed cookie encoding as unauthenticated, not a crash', async () => {
    const { deps } = await authed();
    for (const cookie of ['session=%', 'session=%E0%A4%A', 'other=%zz; session=%']) {
      const meRes = stubRes();
      await meRoute({ method: 'GET', headers: { cookie }, socket: {} }, meRes, deps);
      assert.equal(meRes.statusCode, 401);
      assert.equal(JSON.parse(meRes.body).error.code, 'UNAUTHENTICATED');

      const outRes = stubRes();
      await logoutRoute(
        { method: 'POST', headers: { cookie }, socket: {}, on() {}, destroy() {} },
        outRes,
        deps
      );
      assert.equal(outRes.statusCode, 401);
    }
  });
});

/* ---------- bootstrap ---------- */

describe('admin bootstrap', () => {
  const hasher = { async hash(pw) { return `hash:${pw}`; } };

  it('creates the first admin with a hashed password', async () => {
    const db = fakeDb();
    const result = await bootstrapAdmin({
      db,
      username: 'root',
      password: 'a-very-long-password',
      providedToken: 'setup-token',
      expectedToken: 'setup-token',
      hasher,
    });
    assert.equal(result.ok, true);
    const admin = await db.collection('Admin').findOne({ username: 'root' });
    assert.equal(admin.passwordHash, 'hash:a-very-long-password');
  });

  it('denies wrong or unconfigured setup tokens without revealing which', async () => {
    const db = fakeDb();
    const wrong = await bootstrapAdmin({ db, username: 'root', password: 'a-very-long-password', providedToken: 'nope', expectedToken: 'setup-token', hasher });
    assert.deepEqual(wrong, { ok: false, code: 'SETUP_DENIED' });
    const unconfigured = await bootstrapAdmin({ db, username: 'root', password: 'a-very-long-password', providedToken: 'x', expectedToken: '', hasher });
    assert.deepEqual(unconfigured, { ok: false, code: 'SETUP_UNCONFIGURED' });
  });

  it('refuses when an admin exists or the password is weak', async () => {
    const db = fakeDb();
    await seedAdmin(db);
    const exists = await bootstrapAdmin({ db, username: 'other', password: 'a-very-long-password', providedToken: 't', expectedToken: 't', hasher });
    assert.deepEqual(exists, { ok: false, code: 'ADMIN_EXISTS' });
    const weak = await bootstrapAdmin({ db: fakeDb(), username: 'root', password: 'short', providedToken: 't', expectedToken: 't', hasher });
    assert.deepEqual(weak, { ok: false, code: 'SETUP_INVALID' });
  });
});

/* ---------- rate-limit subject hygiene ---------- */

describe('rate-limit subjects', () => {
  it('hashes client IPs with pepper deterministically', () => {
    const { hashSubject } = require('../lib/rate-limit');
    assert.equal(hashSubject('10.0.0.1', 'pep'), hashSubject('10.0.0.1', 'pep'));
    assert.notEqual(hashSubject('10.0.0.1', 'pep'), hashSubject('10.0.0.2', 'pep'));
  });
});
