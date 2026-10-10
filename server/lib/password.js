'use strict';

/**
 * lib/password.js — bcrypt password hashing (Gate 2 Phase 1).
 *
 * - Cost factor 12 for stored credentials (override only in tests).
 * - `verify` never throws and never logs: unknown/invalid hashes fail closed.
 * - `DUMMY_HASH` lets login compare even when no admin exists, keeping the
 *   failure path timing-uniform without revealing account existence.
 */

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

const HASH_COST = 12;

const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 4);

async function hashPassword(plaintext, cost = HASH_COST) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new TypeError('hashPassword requires a non-empty string.');
  }
  return bcrypt.hash(plaintext, cost);
}

async function verifyPassword(plaintext, hash) {
  try {
    if (typeof plaintext !== 'string' || typeof hash !== 'string') return false;
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, HASH_COST };
