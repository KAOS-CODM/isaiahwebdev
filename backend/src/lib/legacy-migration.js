/**
 * Additive migration planning for the legacy JSON projects.
 *
 * The three projects still kept in `data/projects.json` predate the CMS and are
 * preserved by `readLocalProjects`. This module only *plans* their migration: it
 * derives stable slugs through the single shared schema (`js/projects-schema.js`)
 * and returns the canonical create payloads for projects that are not already in
 * the CMS.
 *
 * It deliberately performs no writes and needs no network or database access, so
 * the planning logic is unit-testable. The executable companion
 * (`backend/scripts/migrate-legacy-projects.js`) performs the writes through the
 * existing authenticated admin API (`POST /api/admin/projects`) — never by
 * bypassing authentication or writing to MongoDB directly.
 *
 * Guarantees:
 *   - Additive: existing projects are never returned for creation, so they are
 *     never overwritten or duplicated.
 *   - Repeatable: re-running the plan after a successful migration produces an
 *     empty create list.
 *   - Stable slugs: `slugify(title)` is the same contract the API, the listing and
 *     the detail pages use, so a migrated project's URL matches its fallback URL.
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const { loadProjectSchema } = require('./project-schema');

/** Repository root (backend/src/lib -> repository root). */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Committed fallback that must be preserved (read-only). */
const DEFAULT_LOCAL_PATH = path.join(PROJECT_ROOT, 'data', 'projects.json');

/** Existing authenticated CMS write endpoint (collection). */
const ADMIN_PROJECTS_PATH = '/api/admin/projects';

/**
 * Read and parse the local fallback projects. Returns an empty array for a
 * missing file or a non-array payload so callers never crash on bad data.
 *
 * @param {string} [filePath]
 * @param {(filePath: string, encoding: string) => string} [readFileSync]
 * @returns {object[]}
 */
function readLocalProjects(filePath = DEFAULT_LOCAL_PATH, readFileSync = fs.readFileSync) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

/**
 * Build the canonical create payload for one normalized project.
 *
 * `order` is intentionally omitted so the admin API appends the project after
 * the existing ones (`store.nextOrder`); `featured` is omitted so the homepage
 * featured project is never changed. `status` is `published` because these are
 * already public projects.
 *
 * @param {object} project - A project normalized by the shared schema.
 * @returns {object}
 */
function toCreatePayload(project) {
  return {
    title: project.title,
    slug: project.slug,
    shortDescription: project.shortDescription || project.description || '',
    category: project.category || '',
    problemStatement: project.problemStatement || '',
    solution: project.solution || '',
    keyFeatures: project.keyFeatures || [],
    technologies: project.technologies || [],
    role: project.role || '',
    developmentStatus: project.developmentStatus || '',
    liveUrl: project.liveUrl || '',
    githubUrl: project.githubUrl || '',
    images: project.images || [],
    status: 'published',
  };
}

/**
 * Plan an additive migration.
 *
 * @param {object} options
 * @param {unknown[]} options.localProjects - Raw entries from `data/projects.json`.
 * @param {unknown[]} options.existingProjects - Projects already in the CMS
 *   (normalized or raw; slugs are derived through the shared schema).
 * @returns {Promise<{ toCreate: object[], skipped: Array<{ slug: string, reason: string }> }>}
 */
async function planMigration({ localProjects, existingProjects }) {
  const schema = await loadProjectSchema();

  const existingSlugs = new Set(
    schema.normalizeProjects(existingProjects).map((project) => project.slug)
  );

  const toCreate = [];
  const skipped = [];

  for (const project of schema.normalizeProjects(localProjects)) {
    if (existingSlugs.has(project.slug)) {
      skipped.push({ slug: project.slug, reason: 'already-in-cms' });
      continue;
    }
    // Guard against duplicates *within* a single batch as well.
    existingSlugs.add(project.slug);
    toCreate.push(toCreatePayload(project));
  }

  return { toCreate, skipped };
}

module.exports = {
  PROJECT_ROOT,
  DEFAULT_LOCAL_PATH,
  ADMIN_PROJECTS_PATH,
  readLocalProjects,
  toCreatePayload,
  planMigration,
};
