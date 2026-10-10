'use strict';

/**
 * lib/auth.js — cookie/session/CSRF wiring for admin routes (Gate 2 Phase 1).
 *
 * - Session cookie: HttpOnly, Secure, SameSite=Lax, Path=/, 12h lifetime.
 * - Mutations additionally require the per-session CSRF token in the
 *   `x-csrf-token` header, plus an Origin/Referer check when the client sends
 *   one (checked against the request host or PUBLIC_SITE_URL).
 */

const { SESSION_TTL_MS, findSession } = require('./sessions');

const SESSION_COOKIE = 'session';
const CSRF_HEADER = 'x-csrf-token';

function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (name && out[name] === undefined) {
      try {
        out[name] = decodeURIComponent(raw);
      } catch {
        // Malformed percent-encoding: treat the cookie as absent so the
        // caller fails closed (401) instead of throwing URIError (500).
      }
    }
  }
  return out;
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function sessionCookieHeader(token, { maxAgeSeconds = SESSION_TTL_MS / 1000 } = {}) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

async function requireSession(req, db, { now = Date.now() } = {}) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = await findSession(db, token, { now });
  if (!session) return null;
  const admin = await db.collection('Admin').findOne({ _id: session.adminId });
  if (!admin) return null;
  return { admin, session, token };
}

function expectedOrigin(req, publicSiteUrl) {
  if (typeof publicSiteUrl === 'string' && publicSiteUrl.length > 0) {
    try {
      return new URL(publicSiteUrl).origin.toLowerCase();
    } catch {
      return null;
    }
  }
  const host = req.headers?.host;
  return typeof host === 'string' && host.length > 0 ? `https://${host.toLowerCase()}` : null;
}

function checkCsrf(req, session, { publicSiteUrl } = {}) {
  const presented = req.headers?.[CSRF_HEADER];
  if (typeof presented !== 'string' || presented.length === 0) return false;
  if (presented !== session.csrfToken) return false;
  const origin = req.headers?.origin || req.headers?.referer;
  if (typeof origin !== 'string' || origin.length === 0) return true;
  let originValue;
  try {
    originValue = new URL(origin).origin.toLowerCase();
  } catch {
    return false;
  }
  const expected = expectedOrigin(req, publicSiteUrl);
  if (expected === null) return true;
  try {
    if (new URL(expected).protocol === 'https:' && originValue.startsWith('http://')) return false;
  } catch {
    return false;
  }
  return originValue === expected.toLowerCase();
}

module.exports = {
  SESSION_COOKIE,
  CSRF_HEADER,
  parseCookies,
  getClientIp,
  sessionCookieHeader,
  clearSessionCookieHeader,
  requireSession,
  checkCsrf,
};
