/**
 * Validation and document building for admin project writes.
 *
 * Reuses the single shared schema (`js/projects-schema.js`) for slug generation
 * and URL validation so the CMS stores exactly what the public API, the listing
 * and the server-rendered pages expect. Validation is deliberately explicit
 * (rather than relying on normalization) so malformed payloads are rejected
 * with 400 instead of being silently coerced.
 */

'use strict';

const { HttpError } = require('./errors');

const VALID_STATUSES = new Set(['published', 'draft']);

/** Free-text optional fields. */
const TEXT_FIELDS = [
  'description',
  'summary',
  'problem',
  'problemSignificance',
  'solution',
  'challenges',
  'tradeoffs',
  'lessonsLearned',
];

/** Optional string-array fields. */
const LIST_FIELDS = ['keyFeatures', 'outcomes'];

function invalid(message) {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}

/**
 * Validate an incoming project payload.
 * @param {object} input - Parsed JSON object.
 * @param {{ partial: boolean, schema: { isValidUrl: (v: unknown) => boolean } }} options
 *   `partial` is true for updates (every field optional, but a supplied field
 *   must still be valid); false for creates (title required).
 * @throws {HttpError} 400 with code VALIDATION_ERROR on any invalid field.
 */
function validateProjectInput(input, { partial, schema }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('Request body must be a JSON object');
  }

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.trim() === '') {
      throw invalid('title must be a non-empty string');
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

  if (input.featured !== undefined && typeof input.featured !== 'boolean') {
    throw invalid('featured must be a boolean');
  }

  if (input.order !== undefined && !Number.isFinite(Number(input.order))) {
    throw invalid('order must be a number');
  }

  for (const field of ['site', 'github']) {
    const value = input[field];
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value !== 'string' || !schema.isValidUrl(value)) {
        throw invalid(`${field} must be a valid http(s) URL`);
      }
    }
  }

  if (input.technologies !== undefined) {
    if (!Array.isArray(input.technologies) || input.technologies.some((t) => typeof t !== 'string')) {
      throw invalid('technologies must be an array of strings');
    }
  }

  if (input.images !== undefined) {
    if (!Array.isArray(input.images)) throw invalid('images must be an array');
    for (const image of input.images) {
      if (typeof image === 'string') {
        if (image.trim() === '') throw invalid('image entries must not be empty');
        continue;
      }
      if (!image || typeof image !== 'object' || Array.isArray(image)) {
        throw invalid('each image must be a URL string or an object with a src');
      }
      if (typeof image.src !== 'string' || image.src.trim() === '') {
        throw invalid('each image object must have a non-empty src');
      }
      if (image.alt !== undefined && typeof image.alt !== 'string') {
        throw invalid('image alt must be a string');
      }
    }
  }

  for (const field of TEXT_FIELDS) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      throw invalid(`${field} must be a string`);
    }
  }

  for (const field of LIST_FIELDS) {
    if (input[field] !== undefined) {
      if (!Array.isArray(input[field]) || input[field].some((v) => typeof v !== 'string')) {
        throw invalid(`${field} must be an array of strings`);
      }
    }
  }
}

/**
 * Derive a safe, URL-ready slug from an explicit value or a title.
 * @param {unknown} value
 * @param {{ slugify: (v: unknown) => string }} schema
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
 * @param {number} [options.order] - Resolved order (fallback to merged input).
 * @param {{ normalizeProject: Function }} options.schema
 * @returns {object}
 */
function buildProjectDoc({ input, existing = null, slug, order, schema }) {
  const merged = existing ? { ...existing, ...input } : { ...input };
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
  validateProjectInput,
  deriveSlug,
  buildProjectDoc,
};
