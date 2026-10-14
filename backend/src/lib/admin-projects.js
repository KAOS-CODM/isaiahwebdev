/**
 * Validation and document building for admin project writes.
 *
 * Reuses the single shared schema (`js/projects-schema.js`) for slug generation,
 * normalization and URL validation so the CMS stores exactly what the public
 * API, the listing and the server-rendered pages expect. Validation is
 * deliberately explicit (rather than relying on normalization) so malformed
 * payloads are rejected with 400 instead of being silently coerced.
 *
 * The editor sends the current field names (`shortDescription`, `liveUrl`,
 * `githubUrl`, `problemStatement`); the legacy names (`description`, `site`,
 * `github`, `problem`) are still accepted so older API clients keep working.
 */

'use strict';

const { HttpError } = require('./errors');

const VALID_STATUSES = new Set(['published', 'draft']);
const VALID_DEVELOPMENT_STATUSES = new Set(['in-progress', 'completed', 'archived']);

/**
 * Current field name -> legacy field name. Used when building the stored
 * document so a value the editor supplies always wins over a stale legacy field
 * (including clearing a value).
 */
const FIELD_ALIASES = {
  shortDescription: 'description',
  problemStatement: 'problem',
  liveUrl: 'site',
  githubUrl: 'github',
};

/** Optional free-text fields (checked as strings and length-limited). */
const TEXT_FIELDS = [
  'title',
  'shortDescription',
  'description',
  'category',
  'problemStatement',
  'problem',
  'problemSignificance',
  'solution',
  'role',
  'summary',
  'challenges',
  'tradeoffs',
  'lessonsLearned',
];

/** Optional string-array fields. */
const LIST_FIELDS = ['keyFeatures', 'technologies', 'outcomes'];

/** Optional URL fields (validated as http(s) when non-empty). */
const URL_FIELDS = ['liveUrl', 'site', 'githubUrl', 'github'];

/** Sensible limits for the structured content. */
const LIMITS = {
  title: 200,
  shortDescription: 600,
  category: 100,
  role: 120,
  text: 20000,
  url: 2048,
  arrayItems: 50,
  arrayItem: 200,
  technology: 60,
  images: 50,
  imageSrc: 2048,
  imageAlt: 300,
};

/** Per-field string limits; anything else falls back to the generic text cap. */
const STRING_LIMITS = {
  title: LIMITS.title,
  shortDescription: LIMITS.shortDescription,
  description: LIMITS.shortDescription,
  category: LIMITS.category,
  role: LIMITS.role,
};

function invalid(message) {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}

/**
 * Validate an incoming project payload.
 * @param {object} input - Parsed JSON object.
 * @param {{ partial: boolean, schema: { isValidUrl: Function } }} options
 *   `partial` is true for updates (all fields optional) and false for creates
 *   (title required).
 * @throws {HttpError} 400 when any supplied field is missing or malformed.
 */
function validateProjectInput(input, { partial, schema }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('Request body must be a JSON object');
  }

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.trim() === '') {
      throw invalid('title must be a non-empty string');
    }
    if (input.title.length > LIMITS.title) {
      throw invalid(`title must be at most ${LIMITS.title} characters`);
    }
  } else if (!partial) {
    throw invalid('title is required');
  }

  if (input.slug !== undefined && typeof input.slug !== 'string') {
    throw invalid('slug must be a string');
  }

  if (input.status !== undefined && !VALID_STATUSES.has(input.status)) {
    throw invalid("status must be 'draft' or 'published'");
  }

  if (
    input.developmentStatus !== undefined &&
    input.developmentStatus !== '' &&
    !VALID_DEVELOPMENT_STATUSES.has(input.developmentStatus)
  ) {
    throw invalid('developmentStatus must be one of in-progress, completed, archived');
  }

  if (input.featured !== undefined && typeof input.featured !== 'boolean') {
    throw invalid('featured must be a boolean');
  }

  if (input.order !== undefined && !Number.isFinite(Number(input.order))) {
    throw invalid('order must be a number');
  }

  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw invalid(`${field} must be a string`);
    const max = STRING_LIMITS[field] || LIMITS.text;
    if (value.length > max) throw invalid(`${field} must be at most ${max} characters`);
  }

  for (const field of URL_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !schema.isValidUrl(value)) {
      throw invalid(`${field} must be a valid http(s) URL`);
    }
    if (value.length > LIMITS.url) throw invalid(`${field} must be at most ${LIMITS.url} characters`);
  }

  for (const field of LIST_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw invalid(`${field} must be an array of strings`);
    }
    if (value.length > LIMITS.arrayItems) {
      throw invalid(`${field} must contain at most ${LIMITS.arrayItems} entries`);
    }
    const itemMax = field === 'technologies' ? LIMITS.technology : LIMITS.arrayItem;
    if (value.some((item) => item.trim().length > itemMax)) {
      throw invalid(`each ${field} entry must be at most ${itemMax} characters`);
    }
  }

  if (input.images !== undefined) {
    if (!Array.isArray(input.images)) throw invalid('images must be an array');
    if (input.images.length > LIMITS.images) {
      throw invalid(`images must contain at most ${LIMITS.images} entries`);
    }
    for (const image of input.images) {
      if (typeof image === 'string') {
        if (image.trim() === '') throw invalid('image entries must not be empty');
        if (image.length > LIMITS.imageSrc) {
          throw invalid(`each image URL must be at most ${LIMITS.imageSrc} characters`);
        }
        continue;
      }
      if (!image || typeof image !== 'object' || Array.isArray(image)) {
        throw invalid('each image must be a URL string or an object with a src');
      }
      if (typeof image.src !== 'string' || image.src.trim() === '') {
        throw invalid('each image object must have a non-empty src');
      }
      if (image.src.length > LIMITS.imageSrc) {
        throw invalid(`each image src must be at most ${LIMITS.imageSrc} characters`);
      }
      if (image.alt !== undefined && typeof image.alt !== 'string') {
        throw invalid('image alt must be a string');
      }
      if (typeof image.alt === 'string' && image.alt.length > LIMITS.imageAlt) {
        throw invalid(`image alt must be at most ${LIMITS.imageAlt} characters`);
      }
      if (image.publicId !== undefined && typeof image.publicId !== 'string') {
        throw invalid('image publicId must be a string');
      }
    }
  }
}

/**
 * Derive a safe, URL-ready slug from an explicit value or a title.
 * @param {unknown} value
 * @param {{ slugify: (value: unknown) => string }} schema
 * @returns {string}
 * @throws {HttpError} 400 when a usable slug cannot be produced.
 */
function deriveSlug(value, schema) {
  const slug = schema.slugify(value);
  if (!slug) throw invalid('a valid slug could not be derived');
  return slug;
}

/**
 * Build the canonical document to persist (without timestamps).
 * @param {object} options
 * @param {object} options.input - Validated incoming fields.
 * @param {object|null} [options.existing] - Current normalized project for updates.
 * @param {string} options.slug - Resolved slug.
 * @param {number} [options.order] - Resolved order (falls back to merged input).
 * @param {{ normalizeProject: Function }} options.schema
 * @returns {object}
 */
function buildProjectDoc({ input, existing = null, slug, order, schema }) {
  const merged = existing ? { ...existing, ...input } : { ...input };

  // Drop a legacy field when its current equivalent is supplied, so clearing a
  // value in the editor is not silently repopulated from the legacy field.
  for (const [current, legacy] of Object.entries(FIELD_ALIASES)) {
    if (input[current] === undefined && input[legacy] === undefined) continue;
    delete merged[legacy];
    if (input[current] === undefined) merged[current] = input[legacy];
  }

  // `summary` is a read-only legacy fallback for `shortDescription` (see the
  // shared schema). When the editor supplies the canonical field, drop the
  // legacy `summary` too so an intentional clear is not repopulated from it.
  // When only a legacy `summary` is supplied it is preserved as its own field.
  if (input.shortDescription !== undefined || input.description !== undefined) {
    delete merged.summary;
  }

  const title = String(merged.title ?? '').trim();
  const normalized = schema.normalizeProject({ ...merged, title, slug }, 0);

  const status = merged.status !== undefined ? merged.status : existing ? existing.status : 'draft';
  const featured = merged.featured === true;
  const resolvedOrder =
    order !== undefined
      ? order
      : Number.isFinite(Number(merged.order))
        ? Math.trunc(Number(merged.order))
        : 0;

  return { ...normalized, slug, title, status, featured, order: resolvedOrder };
}

module.exports = {
  VALID_STATUSES,
  VALID_DEVELOPMENT_STATUSES,
  FIELD_ALIASES,
  LIMITS,
  validateProjectInput,
  deriveSlug,
  buildProjectDoc,
};
