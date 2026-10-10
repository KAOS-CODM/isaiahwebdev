'use strict';

/**
 * lib/admin-bootstrap.js — first-administrator provisioning core (Gate 2 Phase 1).
 *
 * Pure logic; the TTY prompting lives in server/scripts/create-admin.js so
 * this is deterministically testable. The setup token is compared in constant
 * time and never included in errors, logs, or responses.
 */

const crypto = require('node:crypto');

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_USERNAME_LENGTH = 64;

function safeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

async function bootstrapAdmin({ db, username, password, providedToken, expectedToken, hasher }) {
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) {
    return { ok: false, code: 'SETUP_UNCONFIGURED' };
  }
  if (!safeEqualString(providedToken, expectedToken)) {
    return { ok: false, code: 'SETUP_DENIED' };
  }
  if (typeof username !== 'string' || username.trim().length === 0 || username.length > MAX_USERNAME_LENGTH) {
    return { ok: false, code: 'SETUP_INVALID' };
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, code: 'SETUP_INVALID' };
  }
  const existing = await db.collection('Admin').findOne({});
  if (existing) {
    return { ok: false, code: 'ADMIN_EXISTS' };
  }
  const passwordHash = await hasher.hash(password);
  const result = await db.collection('Admin').insertOne({
    username: username.trim(),
    passwordHash,
    createdAt: new Date(),
  });
  return { ok: true, adminId: result.insertedId };
}

module.exports = { safeEqualString, bootstrapAdmin, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH };
