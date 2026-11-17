'use strict';

const { HttpError } = require('./errors');

const VALID_STATUSES = new Set(['draft', 'published']);

const TEXT_FIELDS = ['title', 'issuer', 'description', 'credentialId', 'category'];
const URL_FIELDS = ['verificationUrl'];

const LIMITS = {
  title: 200,
  issuer: 200,
  description: 2000,
  credentialId: 200,
  category: 100,
  url: 2048,
  slug: 80,
  imageSrc: 2048,
  imageAlt: 300,
  displayOrder: undefined, // integer checked separately
};

const STRING_LIMITS = {
  title: LIMITS.title,
  issuer: LIMITS.issuer,
  description: LIMITS.description,
  credentialId: LIMITS.credentialId,
  category: LIMITS.category,
};

/**
 * Derive a safe, URL-ready slug from an explicit value or a title.
 * @param {unknown} value
 * @param {{ slugify: (value: unknown) => string }} schema
 * @returns {string}
 * @throws {HttpError} 400 when a usable slug cannot be produced.
 */
function deriveSlug(value, schema) {
  const slug = schema.slugify(value);
  if (!slug) throw new HttpError(400, 'VALIDATION_ERROR', 'a valid slug could not be derived');
  return slug;
}

/**
 * Validate an incoming certificate payload.
 * @param {object} input - Parsed JSON object.
 * @param {{ partial: boolean, schema: { isValidUrl: Function, slugify: Function },
 *   existing?: object }} options
 *   `partial` is true for updates (all fields optional) and false for creates
 *   (title and issuer required). `existing` is the current normalized certificate
 *   for merging before evidence checks.
 * @throws {HttpError} 400 when any supplied field is missing or malformed.
 */
function validateCertificateInput(input, { partial, schema, existing = null }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object');
  }

  // ---- title (required on create; optional on update but must be valid if supplied) ----
  if (partial) {
    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || input.title.trim() === '') {
        throw new HttpError(400, 'VALIDATION_ERROR', 'title must be a non-empty string');
      }
      if (input.title.length > LIMITS.title) {
        throw new HttpError(400, 'VALIDATION_ERROR', `title must be at most ${LIMITS.title} characters`);
      }
    }
  } else {
    if (!input.title) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'title is required');
    }
    if (typeof input.title !== 'string' || input.title.trim() === '') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'title must be a non-empty string');
    }
    if (input.title.length > LIMITS.title) {
      throw new HttpError(400, 'VALIDATION_ERROR', `title must be at most ${LIMITS.title} characters`);
    }
  }

  // ---- issuer (required on create; optional on update but must be valid if supplied) ----
  if (partial) {
    if (input.issuer !== undefined) {
      if (typeof input.issuer !== 'string' || input.issuer.trim() === '') {
        throw new HttpError(400, 'VALIDATION_ERROR', 'issuer must be a non-empty string');
      }
      if (input.issuer.length > LIMITS.issuer) {
        throw new HttpError(400, 'VALIDATION_ERROR', `issuer must be at most ${LIMITS.issuer} characters`);
      }
    }
  } else {
    if (!input.issuer) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'issuer is required');
    }
    if (typeof input.issuer !== 'string' || input.issuer.trim() === '') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'issuer must be a non-empty string');
    }
    if (input.issuer.length > LIMITS.issuer) {
      throw new HttpError(400, 'VALIDATION_ERROR', `issuer must be at most ${LIMITS.issuer} characters`);
    }
  }

  // ---- slug (optional; if supplied, must be a string and follow format) ----
  if (input.slug !== undefined) {
    if (typeof input.slug !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'slug must be a string');
    }
    if (input.slug !== '' && input.slug !== null) {
      // Strict format check: lowercase alphanumeric + hyphens only
      const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!slugPattern.test(input.slug)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'slug must be lowercase alphanumeric with hyphens only');
      }
      if (input.slug.length > LIMITS.slug) {
        throw new HttpError(400, 'VALIDATION_ERROR', `slug must be at most ${LIMITS.slug} characters`);
      }
    }
  }

  // ---- status ----
  if (input.status !== undefined) {
    if (!VALID_STATUSES.has(input.status)) {
      throw new HttpError(400, 'VALIDATION_ERROR', "status must be 'draft' or 'published'");
    }
  }

  // ---- displayOrder (optional integer) ----
  if (input.displayOrder !== undefined) {
    if (!Number.isFinite(Number(input.displayOrder))) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'displayOrder must be a number');
    }
  }

  // ---- verificationUrl (optional; if supplied must be valid http(s) URL) ----
  if (input.verificationUrl !== undefined && input.verificationUrl !== null) {
    if (typeof input.verificationUrl !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'verificationUrl must be a string');
    }
    const trimmed = input.verificationUrl.trim();
    if (trimmed !== '') {
      if (trimmed.length > LIMITS.url) {
        throw new HttpError(400, 'VALIDATION_ERROR', `verificationUrl must be at most ${LIMITS.url} characters`);
      }
      if (!schema.isValidUrl(trimmed)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'verificationUrl must be a valid http(s) URL');
      }
    }
  }

  // ---- image (optional; if string URL, must be valid http(s) if non-empty) ----
  if (input.image !== undefined) {
    if (typeof input.image === 'string') {
      const trimmed = input.image.trim();
      if (trimmed !== '') {
        if (trimmed.length > LIMITS.imageSrc) {
          throw new HttpError(400, 'VALIDATION_ERROR', `image URL must be at most ${LIMITS.imageSrc} characters`);
        }
        if (!schema.isValidUrl(trimmed)) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'image URL must be a valid http(s) URL');
        }
      }
    } else if (input.image === null) {
      // clearing the image is allowed
    } else if (input.image && typeof input.image === 'object') {
      // object form: validate src, alt, publicId
      const image = input.image;
      if (image.src !== undefined) {
        if (typeof image.src !== 'string' || image.src.trim() === '') {
          throw new HttpError(400, 'VALIDATION_ERROR', 'image src must be a non-empty string');
        }
        if (image.src.trim().length > LIMITS.imageSrc) {
          throw new HttpError(400, 'VALIDATION_ERROR', `image src must be at most ${LIMITS.imageSrc} characters`);
        }
        if (!schema.isValidUrl(image.src.trim())) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'image src must be a valid http(s) URL');
        }
      }
      if (image.alt !== undefined && typeof image.alt !== 'string') {
        throw new HttpError(400, 'VALIDATION_ERROR', 'image alt must be a string');
      }
      if (image.alt !== undefined && image.alt.trim().length > LIMITS.imageAlt) {
        throw new HttpError(400, 'VALIDATION_ERROR', `image alt must be at most ${LIMITS.imageAlt} characters`);
      }
      if (image.publicId !== undefined) {
        if (typeof image.publicId !== 'string') {
          throw new HttpError(400, 'VALIDATION_ERROR', 'image publicId must be a string');
        }
        if (image.publicId.length > 512) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'image publicId must be at most 512 characters');
        }
      }
    } else {
      throw new HttpError(400, 'VALIDATION_ERROR', 'image must be a string URL, null, or an object with src/alt/publicId');
    }
  }

  // ---- dates (optional; if supplied must match YYYY-MM-DD or YYYY-MM format) ----
  if (input.issueDate !== undefined) {
    if (input.issueDate !== null && typeof input.issueDate !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'issueDate must be a string or null');
    }
    if (input.issueDate !== null && input.issueDate.trim() !== '') {
      const datePattern = /^(\d{4})-(\d{2})(-\d{2})?$/;
      if (!datePattern.test(input.issueDate.trim())) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'issueDate must be in YYYY-MM-DD or YYYY-MM format');
      }
      // Basic range validation for month
      const monthMatch = input.issueDate.trim().match(/^(\d{4})-(\d{2})$/);
      if (monthMatch && (Number(monthMatch[2]) < 1 || Number(monthMatch[2]) > 12)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'issueDate month must be between 01 and 12');
      }
    }
  }

  if (input.expiryDate !== undefined) {
    if (input.expiryDate !== null && typeof input.expiryDate !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'expiryDate must be a string or null');
    }
    if (input.expiryDate !== null && input.expiryDate.trim() !== '') {
      const datePattern = /^(\d{4})-(\d{2})(-\d{2})?$/;
      if (!datePattern.test(input.expiryDate.trim())) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'expiryDate must be in YYYY-MM-DD or YYYY-MM format');
      }
      const monthMatch = input.expiryDate.trim().match(/^(\d{4})-(\d{2})$/);
      if (monthMatch && (Number(monthMatch[2]) < 1 || Number(monthMatch[2]) > 12)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'expiryDate month must be between 01 and 12');
      }
    }
  }

  // ---- evidence: at least one of image or verificationUrl must be present ----
  // This check runs against the merged result (existing + input) so that drafts
  // without evidence are also rejected (per task requirements).
  const merged = existing ? { ...existing, ...input } : input;
  const hasImage = merged.image !== null && merged.image !== undefined;
  const hasVerificationUrl = (merged.verificationUrl || '').trim() !== '';
  if (!hasImage && !hasVerificationUrl) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'At least one of image URL or verification URL must be provided');
  }

  return true;
}

/**
 * Build the canonical document to persist (without timestamps).
 * @param {object} options
 * @param {object} options.input - Validated incoming fields.
 * @param {object|null} [options.existing] - Current normalized certificate for updates.
 * @param {string} options.slug - Resolved slug.
 * @param {number} [options.displayOrder] - Resolved display order (falls back to merged input).
 * @param {{ normalizeCertificate: Function }} options.schema
 * @returns {object}
 */
function buildCertificateDoc({ input, existing = null, slug, displayOrder, schema }) {
  const merged = existing ? { ...existing, ...input } : { ...input };

  // title (from input) - guaranteed non-empty when !partial, when partial only checked if supplied
  const title = String(merged.title ?? '').trim();

  // Normalize the full certificate via the shared schema.
  const normalized = schema.normalizeCertificate({ ...merged, title, slug }, 0);

  // Publication status: explicit from input; otherwise preserve existing; otherwise default to draft for new records.
  const status = merged.status !== undefined ? merged.status : existing ? existing.status : 'draft';

  // Display order: input value if supplied, otherwise existing, otherwise 0.
  const resolvedDisplayOrder =
    displayOrder !== undefined
      ? displayOrder
      : Number.isFinite(Number(merged.displayOrder))
        ? Math.trunc(Number(merged.displayOrder))
        : 0;

  // Return the canonical fields, intentionally stripping timestamps that will
  // be added by the store layer (createdAt/updatedAt).
  const { createdAt, updatedAt, ...result } = normalized;
  return {
    ...result,
    slug,
    title,
    status,
    displayOrder: resolvedDisplayOrder,
  };
}

module.exports = {
  VALID_STATUSES,
  TEXT_FIELDS,
  URL_FIELDS,
  LIMITS,
  STRING_LIMITS,
  deriveSlug,
  validateCertificateInput,
  buildCertificateDoc,
};