'use strict';

/**
 * /api/* catch-all — JSON 404 for unknown API routes (Gate 1).
 *
 * More specific function files take precedence; this handles only otherwise
 * unmatched `/api/*` paths so clients never receive the platform-default body.
 */

const { applyApiHeaders } = require('./lib/security');
const { notFound } = require('./lib/errors');

module.exports = async function apiNotFound(req, res) {
  applyApiHeaders(res);
  notFound(res);
};
