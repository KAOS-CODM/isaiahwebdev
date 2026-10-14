/**
 * Private admin CMS API.
 *
 * Route surface (all under `/api/admin`, all JSON):
 *   GET    /bootstrap                              → whether first-admin setup is needed (public)
 *   POST   /setup                                  → create the one administrator (local-only, one-time)
 *   POST   /login                                  → issue a session cookie
 *   GET    /session                                → validate the current session
 *   POST   /logout                                 → clear the session cookie
 *   GET    /projects                               → list all projects (incl. drafts)
 *   POST   /projects                               → create a project
 *   GET    /projects/:slug                         → read one project
 *   PUT    /projects/:slug                         → update a project
 *   DELETE /projects/:slug                         → delete a project
 *   POST   /projects/:slug/publish                 → set status = published
 *   POST   /projects/:slug/unpublish               → set status = draft
 *   GET    /projects/:slug/preview                 → authenticated HTML preview
 *
 * The administrator account lives in MongoDB (username + scrypt password hash +
 * per-admin token secret), never in the environment. `/bootstrap` and `/setup`
 * are the only public routes: bootstrap reports whether setup is still needed,
 * and setup creates the single administrator. Setup is restricted to loopback
 * clients in non-production, is rate limited, and is atomically one-time (the
 * account uses a fixed `_id`). Every other route requires a valid session.
 *
 * Sessions are signed HMAC-SHA256 tokens carried in a signed, `HttpOnly` cookie
 * (Path=/api/admin) so a page refresh or a server restart keeps the owner signed
 * in until the eight-hour expiry. A bearer `Authorization` header is still
 * accepted first for non-browser API clients; the cookie is the fallback.
 *
 * Draft projects are never exposed by the public API or the public
 * `/projects/<slug>` pages; the preview HTML is authenticated and marked
 * `X-Robots-Tag: noindex, nofollow`.
 *
 * Note on logout: tokens are stateless (HMAC-signed) so the server keeps no
 * session to revoke. Logout clears the cookie; an outstanding token remains
 * cryptographically valid until its expiry. Deleting or rotating the
 * administrator record invalidates outstanding tokens.
 */

'use strict';

const { getDb } = require('../lib/db-handle');
const { Errors, HttpError, sendJson, sendJsonError } = require('../lib/errors');
const { readJsonBody } = require('../lib/request-body');
const { loadProjectSchema } = require('../lib/project-schema');
const { buildProjectPage } = require('../lib/project-page');
const { SITE_URL } = require('./project-pages');
const auth = require('../lib/admin-auth');
const accounts = require('../lib/admin-accounts');
const { validateProjectInput, deriveSlug, buildProjectDoc } = require('../lib/admin-projects');
const store = require('../lib/project-store');
const { loginRateLimiter, setupRateLimiter } = require('../lib/rate-limit');

const ADMIN_PREFIX = '/api/admin';
const ADMIN_PROJECTS_PREFIX = '/api/admin/projects/';

const ADMIN_COOKIE_NAME = 'portfolio_admin';
const ADMIN_COOKIE_PATH = '/api/admin';
const ADMIN_COOKIE_MAX_AGE_SECONDS = auth.TOKEN_TTL_SECONDS;

/**
 * Resolve the SameSite attribute. `None` is required when the static frontend
 * and the API are different sites (the production layout), `Lax`/`Strict` keep
 * the cookie scoped to same-site requests (the local-development layout).
 * @param {string|undefined} raw
 * @param {'Strict'|'Lax'|'None'} fallback
 * @returns {'Strict'|'Lax'|'None'}
 */
function normalizeSameSite(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim().toLowerCase();
  if (value === 'strict') return 'Strict';
  if (value === 'lax') return 'Lax';
  if (value === 'none') return 'None';
  return fallback;
}

const ADMIN_COOKIE_SAMESITE = normalizeSameSite(
  process.env.ADMIN_COOKIE_SAMESITE,
  process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
);
// A `SameSite=None` cookie is only accepted by browsers over HTTPS, so `Secure`
// is forced whenever that attribute is in use.
const ADMIN_COOKIE_SECURE =
  process.env.NODE_ENV === 'production' || ADMIN_COOKIE_SAMESITE === 'None';

/**
 * Build the Set-Cookie value for the admin session.
 * @param {string} value
 * @param {Date} [expiresAt]
 * @returns {string}
 */
function buildAdminCookie(value, expiresAt) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=${value}`,
    `Path=${ADMIN_COOKIE_PATH}`,
    'HttpOnly',
    `SameSite=${ADMIN_COOKIE_SAMESITE}`,
    `Max-Age=${ADMIN_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (ADMIN_COOKIE_SECURE) parts.push('Secure');
  if (expiresAt) parts.push(`Expires=${expiresAt.toUTCString()}`);
  return parts.join('; ');
}

/** Emit the session cookie for a freshly issued token. */
function setAdminCookie(res, token, expiresAt) {
  res.setHeader('Set-Cookie', buildAdminCookie(encodeURIComponent(token), expiresAt));
}

function clearAdminCookie(res) {
  const expired = new Date(0).toUTCString();
  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    `Path=${ADMIN_COOKIE_PATH}`,
    'HttpOnly',
    `SameSite=${ADMIN_COOKIE_SAMESITE}`,
    `Expires=${expired}`,
    'Max-Age=0',
  ];
  if (ADMIN_COOKIE_SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function extractAdminToken(req) {
  const bearer = auth.extractBearer(req.headers['authorization']);
  if (bearer) return bearer;
  const cookie = req.headers.cookie;
  if (typeof cookie !== 'string') return null;
  const parts = cookie.split(';');
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i].trim();
    if (!p) continue;
    if (p.startsWith(`${ADMIN_COOKIE_NAME}=`)) {
      const value = p.slice(ADMIN_COOKIE_NAME.length + 1) || '';
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

/**
 * Whether first-administrator setup may be attempted from this request.
 * Restricted to loopback clients while not running in production, so a deployed
 * service (which sits behind a proxy) can never be claimed remotely.
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
function setupAllowed(req) {
  if (process.env.NODE_ENV === 'production') return false;
  return auth.isLoopbackAddress(req.socket && req.socket.remoteAddress);
}

/**
 * Identify the client for rate limiting. `remoteAddress` is used deliberately:
 * a spoofable `X-Forwarded-For` header would let an attacker bypass the limiter.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function clientKeyFor(req) {
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow);
  sendJsonError(res, Errors.methodNotAllowed());
}

/**
 * Enforce a valid session (cookie or bearer token). On failure the response is
 * already sent.
 * @returns {Promise<object|null>} The token payload, or null when unauthorized.
 */
async function requireAuth(req, res) {
  const token = extractAdminToken(req);
  if (!token) {
    sendJsonError(res, Errors.unauthorized());
    return null;
  }

  const db = getDb();
  if (!db) {
    sendJsonError(res, Errors.serviceUnavailable('Content is temporarily unavailable'));
    return null;
  }

  const admin = await accounts.getAdmin(db);
  if (!admin) {
    sendJsonError(res, Errors.unauthorized());
    return null;
  }

  const result = auth.verifyToken(admin.tokenSecret, token);
  if (!result.ok) {
    sendJsonError(res, result.reason === 'expired' ? Errors.tokenExpired() : Errors.unauthorized());
    return null;
  }
  return result.payload;
}

/**
 * Report whether the initial administrator still needs to be created. Public:
 * it exposes only a boolean, and the setup endpoint itself is protected.
 */
async function handleBootstrap(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  const db = getDb();
  if (!db) {
    sendJsonError(res, Errors.serviceUnavailable('Content is temporarily unavailable'));
    return;
  }

  const setupRequired = await accounts.isSetupRequired(db);
  sendJson(res, 200, { setupRequired });
}

/**
 * Create the single administrator. Local-only and one-time (see `setupAllowed`
 * and `accounts.createInitialAdmin`). On success a token is issued so the new
 * owner lands straight in the dashboard.
 */
async function handleSetup(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  if (!setupAllowed(req)) {
    sendJsonError(res, Errors.setupForbidden('Administrator setup is only available locally during development'));
    return;
  }

  const clientKey = clientKeyFor(req);
  const status = setupRateLimiter.check(clientKey);
  if (!status.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(status.retryAfterMs / 1000))));
    sendJsonError(res, Errors.tooManyRequests('Too many setup attempts. Try again later.'));
    return;
  }

  const db = getDb();
  if (!db) {
    sendJsonError(res, Errors.serviceUnavailable('Content is temporarily unavailable'));
    return;
  }

  const body = await readJsonBody(req);
  setupRateLimiter.record(clientKey);

  const credentials = accounts.validateSetupInput(body);
  const admin = await accounts.createInitialAdmin(db, credentials);

  const token = auth.signToken(admin.tokenSecret);
  const expiresAt = new Date(Date.now() + auth.TOKEN_TTL_SECONDS * 1000);
  setAdminCookie(res, token, expiresAt);
  sendJson(res, 201, { token, expiresAt: expiresAt.toISOString(), username: admin.username });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJsonError(res, Errors.methodNotAllowed());
    return;
  }

  const clientKey = clientKeyFor(req);
  const status = loginRateLimiter.check(clientKey);
  if (!status.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(status.retryAfterMs / 1000))));
    sendJsonError(res, Errors.tooManyRequests('Too many login attempts. Try again later.'));
    return;
  }

  const db = getDb();
  if (!db) {
    sendJsonError(res, Errors.serviceUnavailable('Content is temporarily unavailable'));
    return;
  }

  const body = await readJsonBody(req);
  loginRateLimiter.record(clientKey);

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const admin = await accounts.verifyCredentials(db, username, password);
  if (!admin) {
    sendJsonError(res, Errors.unauthorized('Invalid credentials'));
    return;
  }

  loginRateLimiter.reset(clientKey);
  const token = auth.signToken(admin.tokenSecret);
  const expiresAt = new Date(Date.now() + auth.TOKEN_TTL_SECONDS * 1000);
  setAdminCookie(res, token, expiresAt);
  sendJson(res, 200, { token, expiresAt: expiresAt.toISOString(), username: admin.username });
}

async function handleSession(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJsonError(res, Errors.methodNotAllowed());
    return;
  }
  const payload = await requireAuth(req, res);
  if (!payload) return;

  sendJson(res, 200, {
    authenticated: true,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJsonError(res, Errors.methodNotAllowed());
    return;
  }
  const payload = await requireAuth(req, res);
  if (!payload) return;

  clearAdminCookie(res);
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Project collection endpoints
// ---------------------------------------------------------------------------

async function handleProjects(req, res) {
  const payload = await requireAuth(req, res);
  if (!payload) return;

  const db = getDb();
  if (!db) {
    sendJsonError(res, Errors.serviceUnavailable('Content is temporarily unavailable'));
    return;
  }

  if (req.method === 'GET') {
    const projects = await store.listAllProjects(db);
    sendJson(res, 200, { projects });
    return;
  }

  if (req.method === 'POST') {
    const schema = await loadProjectSchema();
    const input = await readJsonBody(req);
    validateProjectInput(input, { partial: false, schema });

    const slug = deriveSlug(input.slug !== undefined ? input.slug : input.title, schema);
    const conflict = await db.collection(store.COLLECTION_NAME).findOne({ slug });
    if (conflict) {
      sendJsonError(res, Errors.conflict(`A project with slug "${slug}" already exists`));
      return;
    }

    const order =
      input.order !== undefined ? Math.trunc(Number(input.order)) : await store.nextOrder(db);
    const doc = buildProjectDoc({ input, slug, order, schema });
    const created = await store.createProject(db, doc);
    sendJson(res, 201, { project: created });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  sendJsonError(res, Errors.methodNotAllowed());
}

// ---------------------------------------------------------------------------
// Project item endpoints
// ---------------------------------------------------------------------------

/**
 * Parse `/api/admin/projects/<slug>[/<action>]`.
 * @param {string} pathname
 * @returns {{ slug: string, action: string|null }|null}
 */
function parseProjectPath(pathname) {
  const rest = pathname.slice(ADMIN_PROJECTS_PREFIX.length).replace(/\/+$/, '');
  if (!rest) return null;

  const segments = rest.split('/');
  if (segments.length > 2) return null;

  let slug;
  try {
    slug = decodeURIComponent(segments[0]);
  } catch {
    return null;
  }

  return { slug, action: segments[1] || null };
}

async function handleProjectItem(req, res, pathname) {
  const payload = await requireAuth(req, res);
  if (!payload) return;

  const db = getDb();
  if (!db) {
    sendJsonError(res, Errors.serviceUnavailable('Content is temporarily unavailable'));
    return;
  }

  const parsed = parseProjectPath(pathname);
  if (!parsed || !store.isValidSlug(parsed.slug)) {
    sendJsonError(res, Errors.notFound('Project not found'));
    return;
  }

  const { slug, action } = parsed;

  if (action === 'preview') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendJsonError(res, Errors.methodNotAllowed());
      return;
    }
    await previewProject(req, res, db, slug);
    return;
  }

  if (action === 'publish' || action === 'unpublish') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJsonError(res, Errors.methodNotAllowed());
      return;
    }
    const updated = await store.setStatus(db, slug, action === 'publish' ? 'published' : 'draft');
    if (!updated) {
      sendJsonError(res, Errors.notFound('Project not found'));
      return;
    }
    sendJson(res, 200, { project: updated });
    return;
  }

  if (action !== null) {
    sendJsonError(res, Errors.notFound('Project not found'));
    return;
  }

  if (req.method === 'GET') {
    const project = await store.findProjectBySlug(db, slug);
    if (!project) {
      sendJsonError(res, Errors.notFound('Project not found'));
      return;
    }
    sendJson(res, 200, { project });
    return;
  }

  if (req.method === 'PUT') {
    await updateProject(req, res, db, slug);
    return;
  }

  if (req.method === 'DELETE') {
    const removed = await store.deleteProject(db, slug);
    if (!removed) {
      sendJsonError(res, Errors.notFound('Project not found'));
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  sendJsonError(res, Errors.methodNotAllowed());
}

async function updateProject(req, res, db, slug) {
  const schema = await loadProjectSchema();
  const existing = await store.findProjectBySlug(db, slug);
  if (!existing) {
    sendJsonError(res, Errors.notFound('Project not found'));
    return;
  }

  const input = await readJsonBody(req);
  validateProjectInput(input, { partial: true, schema });

  const newSlug = deriveSlug(input.slug !== undefined ? input.slug : existing.slug, schema);
  if (newSlug !== slug) {
    const conflict = await db.collection(store.COLLECTION_NAME).findOne({ slug: newSlug });
    if (conflict) {
      sendJsonError(res, Errors.conflict(`A project with slug "${newSlug}" already exists`));
      return;
    }
  }

  const doc = buildProjectDoc({ input, existing, slug: newSlug, schema });
  const updated = await store.updateProject(db, slug, doc);
  if (!updated) {
    sendJsonError(res, Errors.notFound('Project not found'));
    return;
  }
  sendJson(res, 200, { project: updated });
}

async function previewProject(req, res, db, slug) {
  const project = await store.findProjectBySlug(db, slug);
  if (!project) {
    sendJsonError(res, Errors.notFound('Project not found'));
    return;
  }

  const { escapeHtml } = await loadProjectSchema();
  const html = buildProjectPage(project, { escapeHtml, siteUrl: SITE_URL });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(html);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const ADMIN_PREFIX_PATH = '/api/admin';

/**
 * Handle any `/api/admin` request. Always writes a response.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} pathname
 */
async function adminHandler(req, res, pathname) {
  try {
    if (pathname === `${ADMIN_PREFIX}/bootstrap`) {
      await handleBootstrap(req, res);
      return;
    }
    if (pathname === `${ADMIN_PREFIX}/setup`) {
      await handleSetup(req, res);
      return;
    }
    if (pathname === `${ADMIN_PREFIX}/login`) {
      await handleLogin(req, res);
      return;
    }
    if (pathname === `${ADMIN_PREFIX}/session`) {
      await handleSession(req, res);
      return;
    }
    if (pathname === `${ADMIN_PREFIX}/logout`) {
      await handleLogout(req, res);
      return;
    }
    if (pathname === `${ADMIN_PREFIX}/projects`) {
      await handleProjects(req, res);
      return;
    }
    if (pathname.startsWith(`${ADMIN_PREFIX}/projects/`)) {
      await handleProjectItem(req, res, pathname);
      return;
    }
    sendJsonError(res, Errors.notFound('Admin route not found'));
  } catch (err) {
    if (err instanceof HttpError) {
      sendJsonError(res, err.toError());
      return;
    }
    console.error('Admin API error:', err && err.message ? err.message : 'unknown error');
    sendJsonError(res, Errors.internalError());
  }
}

module.exports = {
  adminHandler,
  ADMIN_PREFIX,
  parseProjectPath,
  handleBootstrap,
  handleSetup,
  handleLogin,
  handleSession,
  handleLogout,
  handleProjects,
  handleProjectItem,
};
