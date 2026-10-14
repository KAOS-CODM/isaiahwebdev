/**
 * Single-administrator authentication primitives.
 *
 * Approved approach (database-backed administrator, 2026-10-14):
 *   - The administrator record (username + salted scrypt password hash + a
 *     per-admin random token secret) lives in MongoDB, never in the environment
 *     and never in source. No plaintext password is ever stored.
 *   - Stateless, signed HMAC-SHA256 session tokens with an eight-hour expiry.
 *     Tokens are signed with the per-admin secret from the database, so there
 *     is no mandatory signing-secret environment variable. They are carried in
 *     a signed `HttpOnly` cookie (or a bearer header for API clients).
 *   - Node built-in `crypto` only; no third-party dependencies.
 *
 * Nothing here ever logs, returns or echoes a password, hash or secret.
 */

'use strict';

const crypto = require('node:crypto');

/** Token lifetime: eight hours (approved). */
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

/** scrypt cost parameters used when generating/verifying the password hash. */
const SCRYPT_DEFAULTS = { N: 16384, r: 8, p: 1, keylen: 64 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/** Only this subject may hold a valid admin token. */
const ADMIN_SUBJECT = 'admin';

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Constant-time comparison that never throws on length mismatch.
 * @param {Buffer} a
 * @param {Buffer} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Parse a stored password hash of the form:
 *   scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
 * @param {unknown} raw
 * @returns {{N: number, r: number, p: number, salt: Buffer, hash: Buffer}|null}
 */
function parsePasswordHash(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.trim().split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || N < 2 || !Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) {
    return null;
  }

  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || hash.length === 0) return null;

  return { N, r, p, salt, hash };
}

/**
 * Produce a storable password hash.
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = SCRYPT_DEFAULTS;
  const derived = crypto.scryptSync(String(password), salt, keylen, { N, r, p, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Verify a candidate password against a stored hash.
 * Always performs the scrypt work for a well-formed hash so a wrong value does
 * not short-circuit into a cheap timing signal.
 * @param {unknown} password
 * @param {unknown} rawHash - The stored `scrypt$...` value.
 * @returns {boolean}
 */
function verifyPassword(password, rawHash) {
  const parsed = parsePasswordHash(rawHash);
  if (!parsed) return false;
  if (typeof password !== 'string' || password.length === 0) return false;

  let derived;
  try {
    derived = crypto.scryptSync(password, parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    return false;
  }

  return timingSafeEqual(derived, parsed.hash);
}

/**
 * Generate a fresh random token-signing secret for a new administrator.
 * @returns {string} Base64url-encoded 32 random bytes.
 */
function generateTokenSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Sign a bearer token with the given secret.
 * @param {unknown} secret - The per-admin signing secret.
 * @param {number} [nowMs]
 * @returns {string|null} The token, or null when the secret is missing/empty.
 */
function signToken(secret, nowMs = Date.now()) {
  if (typeof secret !== 'string' || secret === '') return null;

  const iat = Math.floor(nowMs / 1000);
  const payload = { sub: ADMIN_SUBJECT, iat, exp: iat + TOKEN_TTL_SECONDS };
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Verify a signed admin token against the given secret.
 * @param {unknown} secret - The per-admin signing secret.
 * @param {unknown} token
 * @param {number} [nowMs] - Injectable clock for tests.
 * @returns {{ ok: true, payload: object } | { ok: false, reason: 'invalid'|'expired' }}
 */
function verifyToken(secret, token, nowMs = Date.now()) {
  if (typeof secret !== 'string' || secret === '' || typeof token !== 'string') {
    return { ok: false, reason: 'invalid' };
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' };
  const [body, sig] = parts;

  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  if (!timingSafeEqual(fromBase64url(sig), expected)) return { ok: false, reason: 'invalid' };

  let payload;
  try {
    payload = JSON.parse(fromBase64url(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (!payload || typeof payload !== 'object' || payload.sub !== ADMIN_SUBJECT) {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { ok: false, reason: 'invalid' };
  }
  if (payload.exp <= Math.floor(nowMs / 1000)) return { ok: false, reason: 'expired' };

  return { ok: true, payload };
}

/**
 * Extract a bearer token from an Authorization header value.
 * @param {unknown} headerValue
 * @returns {string|null}
 */
function extractBearer(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Whether a socket address is a loopback address (IPv4, IPv6 or IPv4-mapped
 * IPv6). Used to restrict first-administrator setup to the local machine.
 * @param {unknown} address
 * @returns {boolean}
 */
function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address === '') return false;

  let host = address;
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) host = mapped[1];

  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map((part) => Number(part));
    if (octets.some((value) => value > 255)) return false;
    return octets[0] === 127;
  }

  return false;
}

module.exports = {
  TOKEN_TTL_SECONDS,
  SCRYPT_DEFAULTS,
  ADMIN_SUBJECT,
  hashPassword,
  verifyPassword,
  generateTokenSecret,
  signToken,
  verifyToken,
  extractBearer,
  parsePasswordHash,
  isLoopbackAddress,
};
