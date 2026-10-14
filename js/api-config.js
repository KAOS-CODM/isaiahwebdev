/**
 * api-config.js
 * The single shared loader used by the homepage and the projects listing.
 * (Project detail pages are rendered on the server, so they do not use this.)
 *
 * Behaviour:
 *   1. If an API base URL is configured, try it first.
 *   2. Fall back to the committed /data/projects.json when the API is missing,
 *      unreachable, returns a non-OK status, returns non-JSON, returns an empty
 *      result, or returns data that normalizes to zero usable projects.
 *
 * The browser sets the Origin header automatically for cross-origin requests;
 * this module never sets it manually. Only an "Accept" header is sent, which is
 * CORS-safelisted, so no preflight is triggered.
 *
 * API base resolution (no proxy is assumed to exist):
 *   - window.PORTFOLIO_API_BASE when set to a non-empty string (production hook)
 *   - http://localhost:8080 for local development hosts
 *   - otherwise null, so production uses the static fallback until an API URL
 *     is explicitly configured.
 */

import { normalizeProjects } from './projects-schema.js';

export const LOCAL_PROJECTS_PATH = '/data/projects.json';
export const PROJECTS_API_PATH = '/api/content/projects';
export const LOCAL_API_BASE = 'http://localhost:8080';

/**
 * Resolve the configured API base URL, or null when none should be used.
 * @param {Window|undefined} [win]
 * @returns {string|null}
 */
export function resolveApiBase(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return null;

  const override = win.PORTFOLIO_API_BASE;
  if (typeof override === 'string' && override.trim() !== '') {
    return override.trim().replace(/\/+$/, '');
  }

  const hostname = win.location && win.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return LOCAL_API_BASE;
  }

  return null;
}

/**
 * Fetch raw projects from the API. Throws on any unusable response.
 * @param {string} base
 * @returns {Promise<unknown[]>}
 */
async function fetchApiProjects(base) {
  const response = await fetch(`${base}${PROJECTS_API_PATH}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`API_HTTP_${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('API_INVALID_CONTENT_TYPE');
  }

  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.projects)) return data.projects;

  throw new Error('API_INVALID_SHAPE');
}

/**
 * Fetch raw projects from the committed JSON fallback.
 * @returns {Promise<unknown[]>}
 */
async function fetchLocalProjects() {
  const response = await fetch(LOCAL_PROJECTS_PATH, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`LOCAL_HTTP_${response.status}`);
  }

  return response.json();
}

/**
 * Load the project list using API-first-with-fallback semantics.
 * @returns {Promise<{ projects: object[], source: 'api'|'local' }>}
 */
export async function loadProjects() {
  const apiBase = resolveApiBase();

  if (apiBase) {
    try {
      const apiProjects = normalizeProjects(await fetchApiProjects(apiBase));
      if (apiProjects.length > 0) {
        return { projects: apiProjects, source: 'api' };
      }
      console.warn('[projects] API returned no usable projects; using local fallback.');
    } catch (error) {
      const reason = error && error.message ? error.message : 'API_ERROR';
      console.warn(`[projects] API unusable (${reason}); using local fallback.`);
    }
  } else {
    console.info('[projects] No API base configured; using local fallback.');
  }

  const localProjects = normalizeProjects(await fetchLocalProjects());
  if (localProjects.length === 0) {
    throw new Error('NO_USABLE_PROJECTS');
  }

  return { projects: localProjects, source: 'local' };
}

/**
 * Load a single project by slug from whichever source is available.
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function loadProjectBySlug(slug) {
  const { projects } = await loadProjects();
  return projects.find((project) => project.slug === slug) || null;
}
