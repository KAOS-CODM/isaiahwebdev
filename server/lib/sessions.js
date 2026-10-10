'use strict';

/**
 * lib/sessions.js — opaque server-side sessions (Gate 2 Phase 1).
 *
 * - Tokens are 256-bit CSPRNG values; only their SHA-256 hash is stored.
 * - Sessions expire absolutely (`SESSION_TTL_MS`) and support revocation.
 * - All time is injected (`now`) so expiry is deterministically testable.
 */

const crypto = require('node:crypto');

const SESSION_TTL_MS = 12 * 3600 * 1000;

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function createSession(db, adminId, { now = Date.now(), ttlMs = SESSION_TTL_MS } = {}) {
  const token = newToken();
  const session = {
    tokenHash: tokenHash(token),
    adminId,
    csrfToken: newCsrfToken(),
    createdAt: new Date(now),
    expiresAt: new Date(now + ttlMs),
    revokedAt: null,
  };
  await db.collection('Session').insertOne(session);
  return { token, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
}

async function findSession(db, token, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const session = await db.collection('Session').findOne({ tokenHash: tokenHash(token) });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (!(session.expiresAt instanceof Date) || session.expiresAt.getTime() <= now) return null;
  return session;
}

async function revokeSession(db, token) {
  if (typeof token !== 'string' || token.length === 0) return;
  await db.collection('Session').updateOne({ tokenHash: tokenHash(token) }, { $set: { revokedAt: new Date() } });
}

async function revokeAllForAdmin(db, adminId) {
  await db.collection('Session').updateMany({ adminId }, { $set: { revokedAt: new Date() } });
}

module.exports = { SESSION_TTL_MS, newToken, tokenHash, newCsrfToken, createSession, findSession, revokeSession, revokeAllForAdmin };
