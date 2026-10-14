/**
 * Loader for the single shared project schema.
 *
 * The canonical schema lives at `js/projects-schema.js` and is used unchanged by
 * the browser loaders, the server-rendered pages and the tests. It is an ES
 * module, while this backend is CommonJS, so it is loaded with a cached dynamic
 * `import()` (supported by every Node version in the supported range).
 *
 * Resolution order (first existing path wins):
 *   1. PROJECTS_SCHEMA_PATH environment override (used when the API service is
 *      deployed with a root directory that does not include the repository's
 *      `js/` folder).
 *   2. <repo-root>/js/projects-schema.js  (backend run from the repository)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CANDIDATE_PATHS = [
  process.env.PROJECTS_SCHEMA_PATH,
  path.resolve(__dirname, '..', '..', '..', 'js', 'projects-schema.js'),
].filter(Boolean);

const SCHEMA_PATH = CANDIDATE_PATHS.find((candidate) => fs.existsSync(candidate)) || CANDIDATE_PATHS[0];

let schemaPromise = null;

/**
 * Load (once) and return the shared schema module.
 * @returns {Promise<{ normalizeProject: Function, normalizeProjects: Function,
 *   publishedProjects: Function, escapeHtml: Function, isValidUrl: Function,
 *   projectPagePath: Function, slugify: Function, DEFAULT_STATUS: string }>}
 */
function loadProjectSchema() {
  if (!schemaPromise) {
    schemaPromise = import(pathToFileURL(SCHEMA_PATH).href).catch((error) => {
      // Allow a later retry instead of caching a rejected promise forever.
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = {
  loadProjectSchema,
  SCHEMA_PATH,
  CANDIDATE_PATHS,
};
