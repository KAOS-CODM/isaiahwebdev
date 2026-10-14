/**
 * Read-only project content endpoint.
 *
 * `GET /api/content/projects` returns the published projects, normalized by the
 * single shared schema (`js/projects-schema.js`) so the JSON API, the browser
 * listing and the server-rendered detail pages all agree on slugs and shape.
 *
 * Only published projects are returned: a document with an explicit non-
 * "published" status (for example "draft") is never exposed.
 */

'use strict';

const { getDb } = require('../lib/db-handle');
const { COLLECTION_NAME, listPublishedProjects } = require('../lib/project-store');
const { Errors, sendJsonError, createError } = require('../lib/errors');

/**
 * Project the shared, normalized project onto the public API shape.
 * @param {object} project
 * @returns {object}
 */
function toApiProject(project) {
  return {
    slug: project.slug,
    title: project.title,
    description: project.description,
    technologies: project.technologies,
    site: project.site,
    github: project.github,
    images: project.images,
    status: project.status,
    featured: project.featured,
    order: project.order,
  };
}

/**
 * Handles GET /api/content/projects
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function projectsHandler(req, res) {
  if (req.method !== 'GET') {
    const error = Errors.methodNotAllowed();
    sendJsonError(res, error);
    return;
  }

  const db = getDb();
  if (!db) {
    const error = createError('SERVICE_UNAVAILABLE', 'Content is temporarily unavailable', 503);
    sendJsonError(res, error);
    return;
  }

  try {
    const projects = (await listPublishedProjects(db)).map(toApiProject);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ projects }));
  } catch (err) {
    console.error('Error fetching projects:', err.message);
    const error = createError('INTERNAL_ERROR', 'Failed to fetch projects', 500);
    sendJsonError(res, error);
  }
}

module.exports = {
  projectsHandler,
  toApiProject,
  COLLECTION_NAME,
};
