'use strict';

/**
 * /api/* catch-all — JSON 404 for unknown API routes (Gate 1).
 *
 * More specific function files take precedence; this handles only otherwise
 * unmatched `/api/*` paths so clients never receive the platform-default body.
 */

const { applyApiHeaders } = require('../server/lib/security');
const { notFound } = require('../server/lib/errors');

module.exports = async function apiNotFound(req, res) {
  applyApiHeaders(res);
  notFound(res);
};
