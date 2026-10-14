/**
 * CORS middleware with strict origin validation and canonicalization.
 * Uses url.origin for canonicalization (spec-compliant, IPv6-safe).
 */

const url = require('node:url');

const DEV_DEFAULTS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'];

/** Default methods/headers advertised for the existing read-only surface. */
const DEFAULT_METHODS = 'GET, OPTIONS';
const DEFAULT_ALLOW_HEADERS = 'Content-Type';

/**
 * Validate and parse CORS_ORIGINS configuration.
 * @param {string|undefined} raw - Raw CORS_ORIGINS value from process.env
 * @param {boolean} isProduction - Whether running in production
 * @returns {string[]} Validated, canonical origin allowlist
 * @throws {Error} If configuration is invalid
 */
function validateAndParseOrigins(raw, isProduction) {
  // 1. Unset vs explicitly set
  if (raw === undefined) {
    if (!isProduction) {
      return DEV_DEFAULTS;
    }
    throw new Error('CORS_ORIGINS must be set in production');
  }

  // 2. Explicitly empty or whitespace-only
  if (raw.trim() === '') {
    throw new Error('CORS_ORIGINS must not be empty');
  }

  // 3. Split on commas — reject empty entries (no silent filtering)
  const parts = raw.split(',');
  const origins = [];

  for (const part of parts) {
    const origin = part.trim();

    if (origin === '') {
      throw new Error('CORS_ORIGINS contains empty entry');
    }

    // 4. Parse with URL constructor
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid origin URL: ${origin}`);
    }

    // 5. Protocol: only http: or https:
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Origin must use http: or https:: ${origin}`);
    }

    // 6. Credentials
    if (parsed.username || parsed.password) {
      throw new Error(`Origin must not contain credentials: ${origin}`);
    }

    // 7. Path: must be root only (empty or '/')
    if (parsed.pathname !== '' && parsed.pathname !== '/') {
      throw new Error(`Origin must not contain a path: ${origin}`);
    }

    // 8. Query string
    if (parsed.search !== '') {
      throw new Error(`Origin must not contain query string: ${origin}`);
    }

    // 8. Fragment
    if (parsed.hash !== '') {
      throw new Error(`Origin must not contain fragment: ${origin}`);
    }

    // 9. Wildcard
    if (origin.includes('*')) {
      throw new Error(`Wildcard origins not permitted: ${origin}`);
    }

    // 10. Canonical comparison using url.origin
    // url.origin returns canonical serialization: protocol://host:port (no default ports, no trailing slash)
    const canonical = parsed.origin;

    if (origin !== canonical) {
      throw new Error(
        `Origin must be canonical (no default port, no trailing slash): ${origin} → expected ${canonical}`
      );
    }

    origins.push(canonical);
  }

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one valid origin');
  }

  return origins;
}

/**
 * CORS middleware factory.
 * @param {string[]} allowedOrigins - Pre-validated canonical origin allowlist
 * @param {{
 *   allowMissingOrigin?: boolean,
 *   methods?: string,
 *   allowHeaders?: string,
 *   preflightPaths?: (pathname: string) => boolean,
 *   allowCredentials?: boolean,
 * }} [options]
 *   - `allowMissingOrigin`: requests without an Origin header pass through
 *     without CORS response headers. Use only for endpoints reached by
 *     same-origin browser requests (e.g. the public read-only API and the local
 *     unified admin page). The allowlist still governs any request with Origin.
 *   - `methods`/`allowHeaders`: advertised Access-Control-Allow-Methods/Headers.
 *   - `preflightPaths`: which pathnames answer CORS preflight (default `/health`).
 *   - `allowCredentials`: advertise `Access-Control-Allow-Credentials: true` so
 *     browsers send/accept the admin session cookie on cross-origin requests.
 * @returns {Function} Middleware function(req, res, next)
 */
function createCorsMiddleware(allowedOrigins, options = {}) {
  const allowlist = new Set(allowedOrigins);
  const allowMissingOrigin = options.allowMissingOrigin === true;
  const methods = options.methods || DEFAULT_METHODS;
  const allowHeaders = options.allowHeaders || DEFAULT_ALLOW_HEADERS;
  const preflightPaths = options.preflightPaths || ((pathname) => pathname === '/health');
  const allowCredentials = options.allowCredentials === true;

  function setCorsHeaders(res, origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', allowHeaders);
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;

    // Handle preflight requests first
    if (req.method === 'OPTIONS') {
      const pathname = safePathname(req.url);
      if (pathname !== null && preflightPaths(pathname)) {
        handlePreflight(req, res, origin, allowlist, setCorsHeaders);
        return;
      }
      // Unknown path preflight → let the 404 handler deal with it
      return next();
    }

    // Non-preflight requests
    if (!origin) {
      if (allowMissingOrigin) {
        // Same-origin request: no CORS headers needed.
        return next();
      }
      // Missing Origin header → 403
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: { code: 'FORBIDDEN', message: 'Origin header required', status: 403 }
      }));
      return;
    }

    if (allowlist.has(origin)) {
      setCorsHeaders(res, origin);
    }
    // Disallowed origin: do NOT set Access-Control-Allow-Origin (browser blocks;
    // non-browser clients unaffected).

    next();
  };
}

/**
 * Parse the pathname from a request URL without throwing.
 * @param {unknown} rawUrl
 * @returns {string|null}
 */
function safePathname(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return null;
  try {
    return url.parse(rawUrl).pathname || null;
  } catch {
    return null;
  }
}

/**
 * Handle OPTIONS preflight for known routes.
 */
function handlePreflight(req, res, origin, allowlist, setCorsHeadersFn) {
  if (!origin) {
    // No origin on preflight → 403
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: { code: 'FORBIDDEN', message: 'Origin header required', status: 403 }
    }));
    return;
  }

  if (allowlist.has(origin)) {
    setCorsHeadersFn(res, origin);
    res.statusCode = 204;
    res.end();
  } else {
    // Disallowed origin on preflight: no CORS headers
    res.statusCode = 204;
    res.end();
  }
}

/**
 * Load and validate CORS configuration from environment.
 * @returns {string[]} Validated allowlist
 * @throws {Error} If configuration is invalid
 */
function loadCorsConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  return validateAndParseOrigins(process.env.CORS_ORIGINS, isProduction);
}

module.exports = {
  validateAndParseOrigins,
  createCorsMiddleware,
  loadCorsConfig,
  DEV_DEFAULTS,
  DEFAULT_METHODS,
  DEFAULT_ALLOW_HEADERS,
};
