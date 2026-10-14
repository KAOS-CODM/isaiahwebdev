/**
 * Serves the public portfolio files for unified local development.
 *
 * Handles `GET`/`HEAD` for the allowlisted public paths resolved by
 * `lib/static-site.js` and returns `false` for anything else, so the dispatcher
 * can fall through to the JSON 404 handler. Repository internals are never
 * reachable. This route is only reached in non-production (see `index.js`).
 */

'use strict';

const fs = require('node:fs');
const { resolvePublicPath } = require('../lib/static-site');

const ASSET_MAX_AGE_SECONDS = 3600;

/**
 * Serve a public file if the path is allowlisted.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} pathname
 * @returns {boolean} True when the request was handled (including method errors).
 */
function staticHandler(req, res, pathname) {
  const resolved = resolvePublicPath(pathname);
  if (!resolved) return false;

  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method not allowed');
    return true;
  }

  let data;
  try {
    const stats = fs.statSync(resolved.absPath);
    if (!stats.isFile()) return false;
    data = fs.readFileSync(resolved.absPath);
  } catch {
    return false;
  }

  const isHtml = resolved.contentType.startsWith('text/html');
  res.statusCode = 200;
  res.setHeader('Content-Type', resolved.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', isHtml ? 'no-cache' : `public, max-age=${ASSET_MAX_AGE_SECONDS}`);
  res.end(method === 'HEAD' ? undefined : data);
  return true;
}

module.exports = { staticHandler };
