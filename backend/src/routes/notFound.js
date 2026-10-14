/**
 * 404 Not Found handler for unknown routes.
 * Returns consistent JSON error envelope.
 */

const { Errors, sendJsonError } = require('../lib/errors');

function notFoundHandler(req, res) {
  // All unknown routes return 404 with JSON error envelope
  // This includes OPTIONS on unknown paths
  const error = Errors.notFound('Route not found');
  sendJsonError(res, error);
}

module.exports = { notFoundHandler };