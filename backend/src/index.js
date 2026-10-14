/**
 * Minimal CMS API entry point.
 * Native Node.js http server with health endpoint, CORS, and JSON error handling.
 */

const http = require('http');
const url = require('url');

const { loadCorsConfig, createCorsMiddleware } = require('./middleware/cors');
const { healthHandler } = require('./routes/health');
const { notFoundHandler } = require('./routes/notFound');
const { projectsHandler } = require('./routes/projects');
const { projectPagesHandler } = require('./routes/project-pages');
const { adminHandler } = require('./routes/admin');
const { staticHandler } = require('./routes/static');
const { isPublicStaticRequest, frontendServingEnabled } = require('./lib/static-site');
const { setDb } = require('./lib/db-handle');
const { ensureSlugIndex } = require('./lib/project-store');
const { Errors, sendJsonError } = require('./lib/errors');
const { connect, close, getConnectionStatus } = require('./lib/db');

// Configuration
const portEnv = process.env.PORT;
const PORT = portEnv !== undefined ? parseInt(portEnv, 10) : 8080;

// Load and validate CORS configuration at startup
let allowedOrigins;
try {
  allowedOrigins = loadCorsConfig();
} catch (err) {
  console.error('FATAL: CORS configuration error:', err.message);
  process.exit(1);
}

// Create CORS middleware. The strict instance gates health and unknown routes.
// The public read-only projects API uses a variant that also accepts requests
// with no Origin (same-origin browser reads), while its cross-origin allowlist
// is unchanged.
const corsMiddleware = createCorsMiddleware(allowedOrigins);
const publicReadCorsMiddleware = createCorsMiddleware(allowedOrigins, { allowMissingOrigin: true });

// Admin API: same-origin locally (unified dev server) and cross-origin from the
// static frontend in production. Sessions use an HttpOnly cookie, so credentialed
// requests are allowed. CSRF is mitigated by the strict origin allowlist plus
// JSON-only bodies (a cross-site write needs a preflight a disallowed origin
// cannot pass) and the cookie's same-site scoping.
const adminCorsMiddleware = createCorsMiddleware(allowedOrigins, {
  allowMissingOrigin: true,
  allowCredentials: true,
  methods: 'GET, POST, PUT, DELETE, OPTIONS',
  allowHeaders: 'Content-Type, Authorization, Cookie',
  preflightPaths: (pathname) => pathname === '/api/admin' || pathname.startsWith('/api/admin/'),
});

/**
 * Centralized error handler for unexpected errors.
 * Logs full error server-side, sends sanitized response to client.
 */
function errorHandler(err, req, res) {
  console.error('Unhandled error:', err.message);
  console.error(err.stack);
  const error = Errors.internalError();
  sendJsonError(res, error);
}

/**
 * Route dispatcher.
 */
function dispatch(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Canonical project listing URL. The listing page uses relative asset paths,
  // so it must be served without a trailing slash: /projects/ -> /projects.
  if (pathname === '/projects/') {
    res.statusCode = 301;
    res.setHeader('Location', '/projects');
    res.end();
    return;
  }

  // Canonical admin URL. The admin page is a single file; /admin/ is normalized
  // to /admin so its relative asset paths resolve from the site root.
  if (pathname === '/admin/') {
    res.statusCode = 301;
    res.setHeader('Location', '/admin');
    res.end();
    return;
  }

  // Server-rendered project detail pages are navigated to directly by browsers
  // and crawlers, which do not send an Origin header. They must not go through
  // the cross-origin API gate (which would otherwise answer 403).
  if (pathname.startsWith('/projects/')) {
    return projectPagesHandler(req, res, pathname);
  }

  // Public read-only projects API. Same-origin browser requests omit Origin, so
  // this endpoint allows a missing Origin while the CORS allowlist still governs
  // cross-origin responses.
  if (pathname === '/api/content/projects') {
    publicReadCorsMiddleware(req, res, () => {
      if (!res.writableEnded) projectsHandler(req, res);
    });
    return;
  }

  // Health endpoint (strict cross-origin gate).
  if (pathname === '/health') {
    corsMiddleware(req, res, () => {
      if (res.writableEnded) return;
      const handled = healthHandler(req, res);
      if (!handled) {
        // Method not allowed on /health
        const error = Errors.methodNotAllowed();
        sendJsonError(res, error);
      }
    });
    return;
  }

  // Private admin CMS API. Public routes: /bootstrap and /setup; everything
  // else requires a bearer token.
  if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
    adminCorsMiddleware(req, res, () => {
      if (!res.writableEnded) adminHandler(req, res, pathname);
    });
    return;
  }

  // Unified local development: serve the public frontend from an explicit
  // allowlist. Disabled in production, where the backend stays API-only.
  if (frontendServingEnabled() && isPublicStaticRequest(pathname)) {
    if (staticHandler(req, res, pathname)) return;
    // Public path shape but no file on disk: a plain 404, not the cross-origin
    // API gate (a missing asset must not surface as a 403).
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  // All other routes → 404 through the strict cross-origin gate.
  corsMiddleware(req, res, () => {
    if (!res.writableEnded) notFoundHandler(req, res);
  });
}

/**
 * Create and configure the HTTP server.
 * Does not start listening - caller must call server.listen().
 */
function createServer() {
  const server = http.createServer((req, res) => {
    try {
      dispatch(req, res);
    } catch (err) {
      errorHandler(err, req, res);
    }
  });

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`${signal} received, shutting down gracefully...`);
    
    // Close database connection first
    close().then(() => {
      server.close(() => {
        console.log('Server closed.');
        process.exit(0);
      });
    }).catch(err => {
      console.error('Error during shutdown:', err.message);
      server.close(() => {
        console.log('Server closed.');
        process.exit(1);
      });
    });

    // Force close after 5 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 5000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

// Export server factory and configuration
module.exports = {
  createServer,
  PORT,
  allowedOrigins,
  loadCorsConfig,
  createCorsMiddleware,
  setDb
};

// Start server automatically only when run directly (not when required as module)
if (require.main === module) {
  (async () => {
    // Start the HTTP server FIRST, so health endpoint is immediately available
    const server = createServer();
    server.listen(PORT, () => {
      const actualPort = server.address().port;
      console.log(`API server running on http://localhost:${actualPort}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`CORS allowlist: ${allowedOrigins.join(', ')}`);
    });

    // Then attempt MongoDB connection in background (non-blocking)
    connect()
      .then(db => {
        console.log('MongoDB connection established');
        setDb(db);
        // Ensure the unique slug index exists (approved). Fail-soft: a failure
        // is logged but does not take the public site/API down; writes still
        // guard against duplicates.
        return ensureSlugIndex(db).catch(err => {
          console.warn('Could not ensure projects slug index:', err.message);
        });
      })
      .catch(err => {
        console.warn('MongoDB connection failed (server running without database):', err.message);
      });
  })();
}