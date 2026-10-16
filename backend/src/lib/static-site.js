/**
 * Local static frontend serving for the unified development server.
 *
 * In local development the backend serves the public portfolio files so the
 * site and API run through one origin. This is deliberately restricted to an
 * explicit allowlist of public directories and root files: nothing else in the
 * repository (backend/, .env, tests/, .git/, dotfiles, *.md documentation,
 * tooling) is ever reachable. Production stays API-only — see WORKFLOW_BRAIN.md.
 *
 * This module is pure path/filesystem logic (no request handling) so the
 * allowlist can be unit-tested directly.
 */

'use strict';

const path = require('node:path');

/** Repository root (backend/src/lib -> repository root). */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Directories whose files may be served, relative to the repository root. */
const PUBLIC_DIRS = new Set(['assets', 'css', 'js', 'images', 'icon', 'logo', 'data', 'docs']);

/** Non-HTML root files that may be served. */
const PUBLIC_ROOT_FILES = new Set(['robots.txt', 'sitemap.xml']);

/** Extensionless HTML routes used by the existing frontend navigation. */
const HTML_ROUTES = new Map([
  ['/', 'index.html'],
  ['/about', 'about.html'],
  ['/projects', 'projects.html'],
  ['/project', 'project.html'],
  ['/certificates', 'certificates.html'],
  ['/resume', 'resume.html'],
  ['/contact', 'contact.html'],
  ['/admin', 'admin.html'],
]);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Content-Type for a file name, falling back to a non-executable binary type.
 * @param {string} fileName
 * @returns {string}
 */
function contentTypeFor(fileName) {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

/**
 * Whether local frontend serving is enabled. It is disabled whenever the
 * service runs in production, so the deployed backend stays API-only.
 * @returns {boolean}
 */
function frontendServingEnabled() {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Cheap shape check: could this pathname map to a public file? Used by the
 * dispatcher to decide whether to attempt static resolution at all.
 * @param {string} pathname
 * @returns {boolean}
 */
function isPublicStaticRequest(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) return false;
  if (HTML_ROUTES.has(pathname)) return true;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return false;

  if (segments.length >= 2) return PUBLIC_DIRS.has(segments[0]);

  const name = segments[0];
  if (PUBLIC_ROOT_FILES.has(name)) return true;
  // Root-level public HTML pages (e.g. the Google site-verification file).
  return /\.html?$/i.test(name);
}

/**
 * Resolve a request pathname to an absolute file path, or null when it is not
 * an allowed public path. Callers must still confirm the file exists.
 * @param {string} pathname
 * @returns {{ absPath: string, contentType: string }|null}
 */
function resolvePublicPath(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return null;

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;

  const normalized = decoded.replace(/\/+$/, '') || '/';

  if (HTML_ROUTES.has(normalized)) {
    return toPublicFile(HTML_ROUTES.get(normalized), CONTENT_TYPES['.html']);
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;

  if (segments.length === 1) {
    const name = segments[0];
    if (name.startsWith('.')) return null; // never serve dotfiles
    const allowed = PUBLIC_ROOT_FILES.has(name) || /\.html?$/i.test(name);
    if (!allowed) return null;
    return toPublicFile(name, contentTypeFor(name));
  }

  const top = segments[0];
  if (!PUBLIC_DIRS.has(top)) return null;
  if (segments.some((segment) => segment.startsWith('.'))) return null;
  return toPublicFile(segments.join('/'), contentTypeFor(segments[segments.length - 1]));
}

/**
 * Build a resolved file descriptor, refusing anything outside the repository.
 * @param {string} relativePath
 * @param {string} contentType
 * @returns {{ absPath: string, contentType: string }|null}
 */
function toPublicFile(relativePath, contentType) {
  const absPath = path.resolve(PROJECT_ROOT, relativePath);
  if (absPath !== PROJECT_ROOT && !absPath.startsWith(PROJECT_ROOT + path.sep)) return null;
  return { absPath, contentType };
}

module.exports = {
  PROJECT_ROOT,
  PUBLIC_DIRS,
  PUBLIC_ROOT_FILES,
  HTML_ROUTES,
  CONTENT_TYPES,
  contentTypeFor,
  frontendServingEnabled,
  isPublicStaticRequest,
  resolvePublicPath,
};
