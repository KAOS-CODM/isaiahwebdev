'use strict';

/**
 * lib/errors.js — safe, uniform API error responses (Gate 0).
 *
 * 500-class responses never leak internals; callers pass a code only.
 */

function sendError(res, status, code, message, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const body = { error: { code, message } };
  if (extra !== undefined) body.error.details = extra;
  res.end(JSON.stringify(body));
}

function badMethod(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  sendError(res, 405, 'METHOD_NOT_ALLOWED', `Allowed: ${allowed.join(', ')}`);
}

function notFound(res, message = 'Not found.') {
  sendError(res, 404, 'NOT_FOUND', message);
}

function notImplemented(res, message) {
  sendError(res, 501, 'NOT_IMPLEMENTED', message);
}

function unavailable(res, message = 'Service temporarily unavailable.') {
  sendError(res, 503, 'SERVICE_UNAVAILABLE', message);
}

module.exports = { sendError, badMethod, notFound, notImplemented, unavailable };
