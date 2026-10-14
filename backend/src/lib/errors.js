/**
 * Error factory and response helpers for consistent JSON error envelopes.
 */

/**
 * Create a standardized error object.
 * @param {string} code - Machine-readable error code
 * @param {string} message - Human-readable error message
 * @param {number} status - HTTP status code
 * @returns {{code: string, message: string, status: number}}
 */
function createError(code, message, status) {
  return { code, message, status };
}

/**
 * Send a JSON response.
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Send a JSON error response with the correct headers and status code.
 * @param {http.ServerResponse} res - Node.js response object
 * @param {{code: string, message: string, status: number}} error - Error object from createError
 */
function sendJsonError(res, error) {
  res.statusCode = error.status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error }));
}

/**
 * An error that already carries the HTTP status and machine-readable code to
 * return to the client. Thrown by request parsing/validation helpers and
 * translated by the route layer; never leaks internals.
 */
class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }

  /** @returns {{code: string, message: string, status: number}} */
  toError() {
    return createError(this.code, this.message, this.status);
  }
}

/**
 * Predefined error creators for common cases.
 */
const Errors = {
  badRequest: (message = 'Invalid request') => createError('BAD_REQUEST', message, 400),
  unauthorized: (message = 'Authentication required') => createError('UNAUTHORIZED', message, 401),
  tokenExpired: (message = 'Session expired') => createError('TOKEN_EXPIRED', message, 401),
  forbidden: (message = 'Origin header required') => createError('FORBIDDEN', message, 403),
  setupClosed: (message = 'Administrator setup is already complete') =>
    createError('SETUP_CLOSED', message, 403),
  setupForbidden: (message = 'Administrator setup is not available') =>
    createError('SETUP_FORBIDDEN', message, 403),
  notFound: (message = 'Route not found') => createError('NOT_FOUND', message, 404),
  methodNotAllowed: (message = 'Method not allowed') => createError('METHOD_NOT_ALLOWED', message, 405),
  conflict: (message = 'Conflict') => createError('CONFLICT', message, 409),
  payloadTooLarge: (message = 'Request body too large') => createError('PAYLOAD_TOO_LARGE', message, 413),
  unsupportedMediaType: (message = 'Unsupported media type') =>
    createError('UNSUPPORTED_MEDIA_TYPE', message, 415),
  tooManyRequests: (message = 'Too many requests') => createError('RATE_LIMITED', message, 429),
  internalError: (message = 'Internal server error') => createError('INTERNAL_ERROR', message, 500),
  serviceUnavailable: (message = 'Service unavailable') => createError('SERVICE_UNAVAILABLE', message, 503),
  mediaNotConfigured: (message = 'Image uploads are not configured') =>
    createError('MEDIA_NOT_CONFIGURED', message, 503),
  mediaUnavailable: (message = 'The image service is temporarily unavailable') =>
    createError('MEDIA_UNAVAILABLE', message, 503),
  mediaUploadFailed: (message = 'The image could not be uploaded') =>
    createError('MEDIA_UPLOAD_FAILED', message, 502),
  mediaDeleteFailed: (message = 'The image could not be removed from storage') =>
    createError('MEDIA_DELETE_FAILED', message, 502),
  assetInUse: (message = 'This image is still used by a project') =>
    createError('ASSET_IN_USE', message, 409),
};

module.exports = {
  createError,
  sendJson,
  sendJsonError,
  HttpError,
  Errors,
};
