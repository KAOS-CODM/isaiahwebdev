/**
 * Server-rendered project detail pages.
 *
 * `GET|HEAD /projects/<slug>` resolves a published project from the CMS and
 * returns a complete, crawlable HTML document (title, description, technologies,
 * gallery, links, social metadata and JSON-LD) in the initial response — no
 * client-side JavaScript is required to see the content.
 *
 * These routes are navigated to directly by browsers and crawlers, which do not
 * send an `Origin` header, so they deliberately bypass the cross-origin API gate
 * in `dispatch()`. They are not part of the JSON API surface.
 */

'use strict';

const { getDb } = require('../lib/db-handle');
const { loadProjectSchema } = require('../lib/project-schema');
const { findPublishedProjectBySlug, isValidSlug } = require('../lib/project-store');
const { buildProjectPage, buildProjectErrorPage } = require('../lib/project-page');

const PROJECT_PREFIX = '/projects/';

/** Public origin used for canonical/OG/schema.org URLs. */
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://isaiahwebdev.onrender.com').replace(/\/+$/, '');

/**
 * Extract the slug from a `/projects/<slug>` pathname.
 * Returns '' for anything that is not exactly one path segment.
 * @param {string} pathname
 * @returns {string}
 */
function extractSlug(pathname) {
  if (!pathname.startsWith(PROJECT_PREFIX)) return '';
  const rest = pathname.slice(PROJECT_PREFIX.length).replace(/\/+$/, '');
  if (!rest || rest.includes('/')) return '';
  try {
    return decodeURIComponent(rest);
  } catch {
    return '';
  }
}

function sendHtml(res, status, html, isHead) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (isHead) {
    res.end();
    return;
  }
  res.end(html);
}

function errorPage(status, title, message) {
  return buildProjectErrorPage({ status, title, message });
}

/**
 * Handle a project detail page request.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} pathname
 */
async function projectPagesHandler(req, res, pathname) {
  const method = req.method || 'GET';
  const isHead = method === 'HEAD';

  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendHtml(
      res,
      405,
      buildProjectErrorPage({ title: 'Method not allowed', message: 'This page only supports GET requests.' }),
      false
    );
    return;
  }

  const slug = extractSlug(pathname);
  if (!isValidSlug(slug)) {
    sendHtml(
      res,
      404,
      buildProjectErrorPage({
        title: 'Project not found',
        message: 'The project you are looking for does not exist or is no longer available.',
      }),
      isHead
    );
    return;
  }

  const db = getDb();
  if (!db) {
    console.error('Project page requested but no database connection is available.');
    sendHtml(
      res,
      503,
      buildProjectErrorPage({
        title: 'Temporarily unavailable',
        message: 'This project page is temporarily unavailable. Please try again shortly.',
      }),
      isHead
    );
    return;
  }

  try {
    const project = await findPublishedProjectBySlug(db, slug);

    if (!project) {
      sendHtml(
        res,
        404,
        buildProjectErrorPage({
          title: 'Project not found',
          message: 'The project you are looking for does not exist or has not been published.',
        }),
        isHead
      );
      return;
    }

    const { escapeHtml } = await loadProjectSchema();
    const html = buildProjectPage(project, { escapeHtml, siteUrl: SITE_URL });
    sendHtml(res, 200, html, isHead);
  } catch (err) {
    // Log the detail server-side; never expose internals to the client.
    console.error('Error rendering project page:', err.message);
    sendHtml(
      res,
      500,
      buildProjectErrorPage({
        title: 'Something went wrong',
        message: 'This project page could not be loaded right now. Please try again later.',
      }),
      isHead
    );
  }
}

module.exports = {
  projectPagesHandler,
  extractSlug,
  SITE_URL,
  PROJECT_PREFIX,
};
