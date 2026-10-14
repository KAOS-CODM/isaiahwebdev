/**
 * Media upload/asset-management service.
 *
 * Route handlers here write HTTP responses directly and reuse the standard JSON
 * error envelopes. They are called from the admin router after authentication,
 * so every function assumes an authenticated admin.
 *
 * The Cloudinary upload and the MongoDB project write cannot be one atomic
 * transaction, so asset deletion is deliberately conservative:
 *   - nothing is deleted before the database write that removes the reference
 *     has succeeded;
 *   - an asset is only deleted when no project document references its
 *     `publicId` any more (so assets shared with another project are spared);
 *   - an image without a `publicId` is never treated as a deletable asset;
 *   - a cleanup failure is reported (never thrown away) and can be retried
 *     through `DELETE /api/admin/media/images`.
 */

'use strict';

const { Errors, HttpError, sendJson, sendJsonError } = require('./errors');
const { readJsonBody, readBinaryBody } = require('./request-body');
const { publicMediaConfig } = require('./media-config');
const { validateUpload } = require('./media-validation');
const { COLLECTION_NAME, isValidSlug } = require('./project-store');

/** Longest accepted Cloudinary public id. */
const MAX_PUBLIC_ID_LENGTH = 512;

/** Conservative Cloudinary public id shape (letters, digits, `_ . / -`). */
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;

/** Matches the project schema's per-image alt cap. */
const MAX_ALT_LENGTH = 300;

/**
 * Extract the `publicId` of every object-form image in a stored/normalized
 * `images` array. String-form (legacy, manually hosted) images have no asset and
 * are therefore never returned here.
 * @param {unknown} images
 * @returns {string[]}
 */
function imageObjectPublicIds(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image) => image && typeof image === 'object' && !Array.isArray(image))
    .map((image) => (typeof image.publicId === 'string' ? image.publicId.trim() : ''))
    .filter(Boolean);
}

/**
 * Collect every Cloudinary public id referenced by any stored project.
 * @param {import('mongodb').Db} db
 * @returns {Promise<Set<string>>}
 */
async function referencedPublicIds(db) {
  const ids = new Set();
  const docs = await db.collection(COLLECTION_NAME).find({}).toArray();
  for (const doc of docs) {
    for (const publicId of imageObjectPublicIds(doc && doc.images)) ids.add(publicId);
  }
  return ids;
}

/**
 * Whether any stored project references the given Cloudinary public id.
 * @param {import('mongodb').Db} db
 * @param {string} publicId
 * @returns {Promise<boolean>}
 */
async function isPublicIdReferenced(db, publicId) {
  if (!publicId) return false;
  const ids = await referencedPublicIds(db);
  return ids.has(publicId);
}

/**
 * Delete Cloudinary assets that are no longer referenced by any project.
 *
 * Must be called only after the database write that removed the references has
 * succeeded. Failures are collected rather than thrown so a storage hiccup can
 * never corrupt or roll back a successful project write.
 *
 * @param {object} options
 * @param {import('mongodb').Db} options.db
 * @param {string[]} options.publicIds - Candidate public ids.
 * @param {{ deleteAsset: (publicId: string) => Promise<unknown> }} options.client
 * @param {Console} [options.logger]
 * @returns {Promise<{ deleted: string[], failed: Array<{publicId: string, message: string}> }>}
 */
async function cleanupProjectAssets({ db, publicIds, client, logger = console }) {
  const unique = Array.from(new Set((Array.isArray(publicIds) ? publicIds : []).filter(Boolean)));
  if (!unique.length) return { deleted: [], failed: [] };

  let referenced;
  try {
    referenced = await referencedPublicIds(db);
  } catch {
    // Without an authoritative reference set we must not delete anything.
    return {
      deleted: [],
      failed: unique.map((publicId) => ({
        publicId,
        message: 'Could not verify asset references; cleanup skipped',
      })),
    };
  }

  const deleted = [];
  const failed = [];

  for (const publicId of unique) {
    if (referenced.has(publicId)) continue; // still used by another project
    try {
      await client.deleteAsset(publicId);
      deleted.push(publicId);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : 'Cleanup failed';
      failed.push({ publicId, message });
      if (logger && typeof logger.warn === 'function') {
        const code = error && error.code ? error.code : 'UNKNOWN';
        logger.warn(`Pending media cleanup for "${publicId}" (${code})`);
      }
    }
  }

  return { deleted, failed };
}

/** Parse the small set of query parameters the upload endpoint accepts. */
function parseUploadQuery(rawUrl) {
  const empty = { alt: '', slug: '', filename: '' };
  try {
    const parsed = new URL(rawUrl || '/', 'http://localhost');
    return {
      alt: String(parsed.searchParams.get('alt') || '').trim().slice(0, MAX_ALT_LENGTH),
      slug: String(parsed.searchParams.get('slug') || '').trim(),
      filename: String(parsed.searchParams.get('filename') || '').trim().slice(0, 200),
    };
  } catch {
    return empty;
  }
}

/** Nest uploads under a per-project folder when a valid slug is supplied. */
function folderFor(config, slug) {
  return isValidSlug(slug) ? `${config.folder}/${slug}` : config.folder;
}

/** Shared "not configured" guard; returns true when the response was sent. */
function mediaUnavailable(res, config, client) {
  if (config.configured && client && client.isConfigured()) return false;
  sendJsonError(
    res,
    Errors.mediaNotConfigured(
      'Image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the API service.'
    )
  );
  return true;
}

/**
 * `GET /api/admin/media/config` — report upload availability and limits. Never
 * includes the API key or secret.
 */
function handleMediaConfig(req, res, { config }) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJsonError(res, Errors.methodNotAllowed());
    return;
  }
  sendJson(res, 200, { media: publicMediaConfig(config) });
}

/**
 * `POST /api/admin/media/images` — accept a single raw image body and store it
 * in Cloudinary. Metadata is returned for the editor to include in the project.
 */
async function handleImageUpload(req, res, { config, client }) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJsonError(res, Errors.methodNotAllowed());
    return;
  }
  if (mediaUnavailable(res, config, client)) return;

  const buffer = await readBinaryBody(req, { maxBytes: config.maxUploadBytes });
  const validated = validateUpload({
    contentType: req.headers['content-type'],
    buffer,
    maxBytes: config.maxUploadBytes,
    allowedTypes: config.allowedTypes,
  });

  const query = parseUploadQuery(req.url);
  const uploaded = await client.uploadImage(buffer, {
    folder: folderFor(config, query.slug),
    filename: query.filename || undefined,
  });

  sendJson(res, 201, {
    image: {
      src: uploaded.src,
      alt: query.alt,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format || validated.format,
      bytes: uploaded.bytes,
    },
  });
}

/**
 * `DELETE /api/admin/media/images` — delete a single Cloudinary asset by
 * `publicId`. Refused while any project still references the asset, and refused
 * for malformed ids, so a client cannot delete arbitrary storage.
 */
async function handleImageDelete(req, res, { db, config, client }) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    sendJsonError(res, Errors.methodNotAllowed());
    return;
  }
  if (mediaUnavailable(res, config, client)) return;

  const body = await readJsonBody(req);
  const publicId = typeof body.publicId === 'string' ? body.publicId.trim() : '';
  if (!publicId || publicId.length > MAX_PUBLIC_ID_LENGTH) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid publicId is required');
  }
  if (!PUBLIC_ID_PATTERN.test(publicId) || publicId.includes('..')) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid publicId is required');
  }

  if (await isPublicIdReferenced(db, publicId)) {
    sendJsonError(
      res,
      Errors.assetInUse('This image is still used by a project. Remove it from every project first.')
    );
    return;
  }

  await client.deleteAsset(publicId);
  sendJson(res, 200, { ok: true, publicId });
}

module.exports = {
  MAX_PUBLIC_ID_LENGTH,
  MAX_ALT_LENGTH,
  imageObjectPublicIds,
  referencedPublicIds,
  isPublicIdReferenced,
  cleanupProjectAssets,
  folderFor,
  handleMediaConfig,
  handleImageUpload,
  handleImageDelete,
};
