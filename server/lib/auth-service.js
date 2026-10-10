'use strict';

/**
 * lib/auth-service.js — login/logout/session-inspection logic (Gate 2 Phase 1).
 *
 * Route entry points accept injected `deps` so tests run against fakes; the
 * thin files under api/admin/ call them with production wiring. Failures are
 * generic: callers cannot distinguish unknown users from wrong passwords.
 */

const { defaultPool, toSafeDbError } = require('./mongo');
const { createRateLimiter, createAtlasStore, createMemoryStore, hashSubject, RateLimitError } = require('./rate-limit');
const { hashPassword, verifyPassword, DUMMY_HASH } = require('./password');
const { createSession, revokeSession } = require('./sessions');
const {
  getClientIp,
  sessionCookieHeader,
  clearSessionCookieHeader,
  requireSession,
  checkCsrf,
} = require('./auth');
const { applyApiHeaders } = require('./security');
const { sendError, badMethod } = require('./errors');
const { readJsonBody, requiredString, ValidationError } = require('./validate');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

function defaultDeps() {
  return {
    getDb: () => defaultPool.getDb(),
    hasher: { hash: (pw) => hashPassword(pw), verify: (pw, hash) => verifyPassword(pw, hash) },
    pepper: process.env.SESSION_PEPPER,
    publicSiteUrl: process.env.PUBLIC_SITE_URL,
    now: () => Date.now(),
    buildLimiter: (db) =>
      createRateLimiter({
        store: createAtlasStore(db.collection('RateLimit')),
        windowMs: LOGIN_WINDOW_MS,
        maxFailures: LOGIN_MAX_FAILURES,
      }),
  };
}

function loginSubject(ip, pepper) {
  return `login:${hashSubject(ip, typeof pepper === 'string' && pepper.length > 0 ? pepper : 'login')}`;
}

function json(res, status, payload, extraHeaders) {
  applyApiHeaders(res);
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function loginAttempt({ db, username, password, ip, pepper, now, hasher, limiter }) {
  const subject = loginSubject(ip, pepper);
  let gate;
  try {
    gate = await limiter.checkAndRecord({ subject, now });
  } catch (err) {
    if (err instanceof RateLimitError) throw { code: 'STORE_UNAVAILABLE' };
    throw err;
  }
  if (!gate.allowed) throw { code: 'RATE_LIMITED', retryAfterMs: gate.retryAfterMs };
  const admin = await db.collection('Admin').findOne({ username });
  const ok = admin
    ? await hasher.verify(password, admin.passwordHash)
    : await hasher.verify(password, DUMMY_HASH);
  if (!ok || !admin) throw { code: 'INVALID_CREDENTIALS' };
  await limiter.reset({ subject, now });
  const session = await createSession(db, admin._id, { now });
  return { admin, session };
}

async function loginRoute(req, res, deps = defaultDeps()) {
  applyApiHeaders(res);
  if (req.method !== 'POST') {
    badMethod(res, ['POST']);
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    if (err instanceof ValidationError) {
      const status = err.field === 'body' && err.message === 'Request body too large.' ? 413 : err.message.includes('Content-Type') ? 415 : 400;
      sendError(res, status, 'INVALID_REQUEST', 'Invalid request.');
      return;
    }
    sendError(res, 400, 'INVALID_REQUEST', 'Invalid request.');
    return;
  }
  let username;
  let password;
  try {
    username = requiredString(body && body.username, { name: 'username', max: 64 });
    password = requiredString(body && body.password, { name: 'password', max: 128 });
  } catch {
    sendError(res, 400, 'INVALID_REQUEST', 'Invalid request.');
    return;
  }
  const now = deps.now();
  let db;
  try {
    db = await deps.getDb();
  } catch (err) {
    const safe = toSafeDbError(err);
    sendError(res, safe.status, safe.code, safe.message);
    return;
  }
  try {
    const { admin, session } = await loginAttempt({
      db,
      username,
      password,
      ip: getClientIp(req),
      pepper: deps.pepper,
      now,
      hasher: deps.hasher,
      limiter: deps.buildLimiter(db),
    });
    json(
      res,
      200,
      { data: { username: admin.username, csrfToken: session.csrfToken, expiresAt: session.expiresAt } },
      { 'Set-Cookie': sessionCookieHeader(session.token) }
    );
  } catch (err) {
    if (err && err.code === 'RATE_LIMITED') {
      json(res, 429, { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } }, {
        'Retry-After': String(Math.max(1, Math.ceil((err.retryAfterMs || 0) / 1000))),
      });
      return;
    }
    if (err && err.code === 'STORE_UNAVAILABLE') {
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable.');
      return;
    }
    sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }
}

async function logoutRoute(req, res, deps = defaultDeps()) {
  applyApiHeaders(res);
  if (req.method !== 'POST') {
    badMethod(res, ['POST']);
    return;
  }
  const now = deps.now();
  let db;
  try {
    db = await deps.getDb();
  } catch (err) {
    const safe = toSafeDbError(err);
    sendError(res, safe.status, safe.code, safe.message);
    return;
  }
  const ctx = await requireSession(req, db, { now });
  if (!ctx) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    return;
  }
  if (!checkCsrf(req, ctx.session, { publicSiteUrl: deps.publicSiteUrl })) {
    sendError(res, 403, 'CSRF_REJECTED', 'Request rejected.');
    return;
  }
  await revokeSession(db, ctx.token);
  json(res, 200, { data: { loggedOut: true } }, { 'Set-Cookie': clearSessionCookieHeader() });
}

async function meRoute(req, res, deps = defaultDeps()) {
  applyApiHeaders(res);
  if (req.method !== 'GET') {
    badMethod(res, ['GET']);
    return;
  }
  const now = deps.now();
  let db;
  try {
    db = await deps.getDb();
  } catch (err) {
    const safe = toSafeDbError(err);
    sendError(res, safe.status, safe.code, safe.message);
    return;
  }
  const ctx = await requireSession(req, db, { now });
  if (!ctx) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    return;
  }
  json(res, 200, { data: { username: ctx.admin.username, expiresAt: ctx.session.expiresAt } });
}

module.exports = {
  LOGIN_WINDOW_MS,
  LOGIN_MAX_FAILURES,
  loginSubject,
  loginAttempt,
  loginRoute,
  logoutRoute,
  meRoute,
  __memoryLimiterForTests: () =>
    createRateLimiter({ store: createMemoryStore(), windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_MAX_FAILURES }),
};
