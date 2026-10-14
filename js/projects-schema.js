/**
 * projects-schema.js
 * Single shared, dependency-free content schema for portfolio projects.
 *
 * These are pure functions with no browser or Node globals, so the exact same
 * normalization is used by:
 *   - the browser loaders (js/api-config.js and the page renderers),
 *   - the backend that renders the project detail pages and serves the JSON API
 *     (backend/src/lib/project-schema.js loads this file), and
 *   - the tests.
 *
 * Keeping one schema here prevents the listing, the homepage, the API and the
 * server-rendered detail pages from drifting apart.
 */

export const DEFAULT_STATUS = 'published';

/**
 * Basic http/https URL validation.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Convert arbitrary text into a URL-safe slug.
 * @param {unknown} value
 * @returns {string}
 */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * Escape text for safe interpolation into HTML.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((image) => {
      if (typeof image === 'string') {
        const src = image.trim();
        return src ? { src, alt: '' } : null;
      }
      if (image && typeof image === 'object') {
        const src = asString(image.src);
        const alt = asString(image.alt);
        return src ? { src, alt } : null;
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Normalize one raw project (from the API or the local JSON) into the canonical
 * shape. Returns null when the entry is unusable (no usable title/slug).
 *
 * @param {unknown} raw
 * @param {number} [index]
 * @returns {object|null}
 */
export function normalizeProject(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;

  const title = asString(raw.title);
  if (!title) return null;

  const slug = slugify(asString(raw.slug) || title);
  if (!slug) return null;

  const description =
    asString(raw.description) || asString(raw.shortDescription) || asString(raw.summary);

  const order = Number.isFinite(Number(raw.order)) ? Number(raw.order) : index;

  return {
    slug,
    title,
    description,
    technologies: asStringArray(raw.technologies),
    images: normalizeImages(raw.images),
    site: isValidUrl(raw.site) ? asString(raw.site) : '',
    github: isValidUrl(raw.github) ? asString(raw.github) : '',
    status: asString(raw.status) || DEFAULT_STATUS,
    featured: raw.featured === true || (raw.featured === undefined && index === 0),
    order,
    // Optional case-study fields, kept only when the source supplies them.
    summary: asString(raw.summary),
    problem: asString(raw.problem),
    problemSignificance: asString(raw.problemSignificance),
    solution: asString(raw.solution),
    keyFeatures: asStringArray(raw.keyFeatures),
    challenges: asString(raw.challenges),
    tradeoffs: asString(raw.tradeoffs),
    outcomes: asStringArray(raw.outcomes),
    lessonsLearned: asString(raw.lessonsLearned),
  };
}

/**
 * Normalize a list of raw projects, dropping unusable entries and assigning
 * deterministic unique slugs so listing links always match generated pages.
 *
 * @param {unknown} list
 * @returns {object[]}
 */
export function normalizeProjects(list) {
  if (!Array.isArray(list)) return [];

  const usedSlugs = new Set();
  const normalized = [];

  list.forEach((raw, index) => {
    const project = normalizeProject(raw, index);
    if (!project) return;

    let slug = project.slug;
    if (usedSlugs.has(slug)) {
      let suffix = 2;
      while (usedSlugs.has(`${project.slug}-${suffix}`)) suffix += 1;
      slug = `${project.slug}-${suffix}`;
    }
    usedSlugs.add(slug);

    normalized.push({ ...project, slug });
  });

  return normalized.sort((a, b) => a.order - b.order);
}

/**
 * @param {object[]} projects
 * @returns {object[]}
 */
export function publishedProjects(projects) {
  return Array.isArray(projects)
    ? projects.filter((project) => project.status === 'published')
    : [];
}

/**
 * @param {object[]} projects
 * @returns {object[]}
 */
export function featuredProjects(projects) {
  return publishedProjects(projects).filter((project) => project.featured === true);
}

/**
 * Build the site-relative URL for a project's dedicated page.
 * @param {string} slug
 * @returns {string}
 */
export function projectPagePath(slug) {
  return `/projects/${encodeURIComponent(slug)}`;
}
