'use strict';

/**
 * lib/security.js — response hardening for API functions (Gate 0).
 *
 * Applied by every function. No `Server` disclosure, no caching of API
 * responses, no framing.
 */

function applyApiHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = { applyApiHeaders };
