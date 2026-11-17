/**
 * Access to the `certificates` collection.
 *
 * Public reads (`listPublishedCertificates`, `findPublishedCertificateBySlug`)
 * are used by the JSON API and the server-rendered pages. Admin reads and
 * writes (`listAllCertificates`, `findCertificateBySlug`, `createCertificate`,
 * `updateCertificate`, `deleteCertificate`, `setStatus`) back the private CMS.
 *
 * All normalization is delegated to the single shared schema
 * (`js/certificates-schema.js`) so the slugs and publication rules used by the
 * API, the browser listing and the server-rendered pages can never drift apart.
 *
 * A certificate is publicly visible only when the shared schema considers it
 * `published` (an explicit non-"published" `status` — e.g. "draft" — is hidden).
 */

'use strict';

const { loadCertificateSchema } = require('./certificate-schema');
const { HttpError } = require('../lib/errors');

const COLLECTION_NAME = 'certificates';

/** Slugs are lowercase, hyphen-separated and safe to pass to a query. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;

/**
 * @param {unknown} slug
 * @returns {boolean} True when the slug is well-formed and safe for a query.
 */
function isValidSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(slug)
  );
}

/**
 * Collect certificate public IDs from the certificates collection for
 * cross-collection reference checking.
 * @param {import('mongodb').Db} db
 * @returns {Promise<Set<string>>}
 */
async function referencedPublicIds(db) {
  const ids = new Set();
  const docs = await db.collection(COLLECTION_NAME).find({}).toArray();
  for (const doc of docs) {
    const cert = await loadCertificateSchema();
    const normalized = cert.normalizeCertificate(doc);
    if (normalized && normalized.image) {
      const pubId = normalized.image.publicId;
      if (pubId) ids.add(pubId);
    }
  }
  return ids;
}

/** Cache index-creation promises per Db handle (WeakMap keeps tests isolated). */
const slugIndexPromises = new WeakMap();
const certIndexPromises = new WeakMap();

/**
 * Create the unique slug index (idempotent). Resolves once per Db handle.
 * @param {import('mongodb').Db} db
 * @returns {Promise<string>} The index name.
 */
function ensureSlugIndex(db) {
  if (slugIndexPromises.has(db)) return slugIndexPromises.get(db);

  const promise = db
    .collection(COLLECTION_NAME)
    .createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' })
    .catch((err) => {
      slugIndexPromises.delete(db);
      throw err;
    });

  slugIndexPromises.set(db, promise);
  return promise;
}

/**
 * Create the publication + ordering index (idempotent). Resolves once per Db
 * handle. Supports public filtering by status and deterministic sort order.
 * @param {import('mongodb').Db} db
 * @returns {Promise<string>} The index name.
 */
function ensureCertificateIndexes(db) {
  if (certIndexPromises.has(db)) return certIndexPromises.get(db);

  const promise = db
    .collection(COLLECTION_NAME)
    .createIndex({ status: 1, displayOrder: 1, issueDate: -1 }, {
      name: 'status_order_issue_idx',
    })
    .catch((err) => {
      certIndexPromises.delete(db);
      throw err;
    });

  certIndexPromises.set(db, promise);
  return promise;
}

/**
 * Retrieve a string value, trimming if it is a string, or '' otherwise.
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Normalize an optional string array value. */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** @returns {boolean} True for MongoDB duplicate-key errors. */
function isDuplicateKeyError(err) {
  return Boolean(err) && (err.code === 11000 || err.code === 11001);
}

/**
 * Next order value (max existing order + 1).
 * @param {import('mongodb').Db} db
 * @returns {Promise<number>}
 */
async function nextOrder(db) {
  const docs = await db.collection(COLLECTION_NAME).find({}).toArray();
  const orders = docs
    .map((doc) => Number(doc.displayOrder))
    .filter((value) => Number.isFinite(value));
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

/**
 * Insert a new certificate document.
 * @param {import('mongodb').Db} db
 * @param {object} doc - Built by `lib/admin-certificates.js` (includes `slug`).
 * @param {Date} [now]
 * @returns {Promise<object>} The normalized created certificate.
 * @throws {HttpError} 409 when the slug already exists.
 */
async function createCertificate(db, doc, now = new Date()) {
  const timestamp = now.toISOString();
  const stored = { ...doc, createdAt: timestamp, updatedAt: timestamp };

  try {
    await db.collection(COLLECTION_NAME).insertOne(stored);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new HttpError(409, 'SLUG_CONFLICT', `A certificate with slug "${doc.slug}" already exists`);
    }
    throw err;
  }

  const schema = await loadCertificateSchema();
  return schema.normalizeCertificate(stored, 0);
}

/**
 * Update an existing certificate by its current slug.
 * @param {import('mongodb').Db} db
 * @param {string} slug - Current slug.
 * @param {object} doc - Full replacement document (without _id/timestamps).
 * @param {Date} [now]
 * @returns {Promise<object|null>} The updated normalized certificate, or null if missing.
 */
async function updateCertificate(db, slug, doc, now = new Date()) {
  const raw = await findRawCertificateBySlug(db, slug);
  if (!raw) return null;

  const updatedAt = now.toISOString();
  try {
    await db
      .collection(COLLECTION_NAME)
      .updateOne({ _id: raw._id }, { $set: { ...doc, updatedAt } });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new HttpError(409, 'SLUG_CONFLICT', `A certificate with slug "${doc.slug}" already exists`);
    }
    throw err;
  }

  return findCertificateBySlug(db, doc.slug);
}

/**
 * Delete a certificate by slug.
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @returns {Promise<boolean>} True when a document was removed.
 */
async function deleteCertificate(db, slug) {
  const raw = await findRawCertificateBySlug(db, slug);
  if (!raw) return false;

  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: raw._id });
  return result.deletedCount > 0;
}

/**
 * Set a certificate's publication status.
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @param {'published'|'draft'} status
 * @param {Date} [now]
 * @returns {Promise<object|null>} The updated normalized certificate, or null if missing.
 */
async function setStatus(db, slug, status, now = new Date()) {
  const raw = await findRawCertificateBySlug(db, slug);
  if (!raw) return null;

  await db
    .collection(COLLECTION_NAME)
    .updateOne({ _id: raw._id }, { $set: { status, updatedAt: now.toISOString() } });

  return findCertificateBySlug(db, slug);
}

/**
 * Find the raw stored document for a slug (so it can be updated/deleted by id).
 * Falls back to a derived-slug scan for documents without a stored `slug`.
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
async function findRawCertificateBySlug(db, slug) {
  if (!isValidSlug(slug)) return null;

  const collection = db.collection(COLLECTION_NAME);
  const direct = await collection.findOne({ slug });
  if (direct) return direct;

  const schema = await loadCertificateSchema();
  const docs = await collection.find({}).toArray();
  const match = schema.normalizeCertificates(docs).find((cert) => cert.slug === slug);
  if (!match) return null;

  return (
    docs.find(
      (doc) =>
        doc &&
        typeof doc === 'object' &&
        (doc.slug === slug || schema.slugify(doc.title) === slug)
    ) || null
  );
}



/**
 * List all certificates including drafts. For admin use only.
 * @param {import('mongodb').Db} db
 * @returns {Promise<Array>}
 */
async function listAllCertificates(db) {
  const collection = db.collection(COLLECTION_NAME);
  const docs = await collection.find({}).sort({ displayOrder: 1, issueDate: -1 }).toArray();
  const schema = await loadCertificateSchema();
  return schema.normalizeCertificates(docs);
}

/**
 * Retrieve one certificate by its _id. For admin use only.
 * @param {import('mongodb').Db} db
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findCertificateById(db, id) {
  const collection = db.collection(COLLECTION_NAME);
  const raw = await collection.findOne({ _id: new (require("mongodb").ObjectId)(id) });
  if (!raw) return null;
  const schema = await loadCertificateSchema();
  return schema.normalizeCertificate(raw);
}

/**
 * Reorder certificates. Accepts [{slug, displayOrder}, ...].
 * Only displayOrder may be changed; other fields are rejected.
 * @param {import('mongodb').Db} db
 * @param {Array} items - Array of {slug: string, displayOrder: number}
 * @returns {Promise<object>}
 */
async function reorderCertificates(db, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "reorder items must be a non-empty array");
  }

  // Validate each item
  const validItems = [];
  const seenSlugs = new Set();
  for (const item of items) {
    if (typeof item !== "object" || item === null || typeof item.slug !== "string" || typeof item.displayOrder !== "number") {
      throw new HttpError(400, "VALIDATION_ERROR", "each item must be {slug: string, displayOrder: number}");
    }
    if (!isValidSlug(item.slug)) {
      throw new HttpError(400, "VALIDATION_ERROR", "invalid slug: " + item.slug);
    }
    if (seenSlugs.has(item.slug)) {
      throw new HttpError(400, "VALIDATION_ERROR", "duplicate slug: " + item.slug);
    }
    seenSlugs.add(item.slug);
    validItems.push(item);
  }

  const schema = await loadCertificateSchema();
  const updatePromises = validItems.map((item) =>
    db.collection(COLLECTION_NAME).updateOne(
      { slug: item.slug },
      { $set: { displayOrder: item.displayOrder, updatedAt: new Date().toISOString() } }
    )
  );
  await Promise.all(updatePromises);

  // Return the updated certificates
  const slugs = validItems.map((item) => item.slug);
  const docs = await db.collection(COLLECTION_NAME).find({ slug: { $in: slugs } }).toArray();
  return schema.normalizeCertificates(docs);
}


/**
 * List all certificates including drafts. For admin use only.
 * @param {import('mongodb').Db} db
 * @returns {Promise<Array>}
 */
async function listAllCertificates(db) {
  const collection = db.collection(COLLECTION_NAME);
  const docs = await collection.find({}).sort({ displayOrder: 1, issueDate: -1 }).toArray();
  const schema = await loadCertificateSchema();
  return schema.normalizeCertificates(docs);
}

/**
 * Retrieve one certificate by its _id. For admin use only.
 * @param {import('mongodb').Db} db
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findCertificateById(db, id) {
  const collection = db.collection(COLLECTION_NAME);
  const raw = await collection.findOne({ _id: new (require("mongodb").ObjectId)(id) });
  if (!raw) return null;
  const schema = await loadCertificateSchema();
  return schema.normalizeCertificate(raw);
}

/**
 * Reorder certificates. Accepts [{slug, displayOrder}, ...].
 * Only displayOrder may be changed; other fields are rejected.
 * @param {import('mongodb').Db} db
 * @param {Array} items - Array of {slug: string, displayOrder: number}
 * @returns {Promise<object>}
 */
async function reorderCertificates(db, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "reorder items must be a non-empty array");
  }

  // Validate each item
  const validItems = [];
  const seenSlugs = new Set();
  for (const item of items) {
    if (typeof item !== "object" || item === null || typeof item.slug !== "string" || typeof item.displayOrder !== "number") {
      throw new HttpError(400, "VALIDATION_ERROR", "each item must be {slug: string, displayOrder: number}");
    }
    if (!isValidSlug(item.slug)) {
      throw new HttpError(400, "VALIDATION_ERROR", "invalid slug: " + item.slug);
    }
    if (seenSlugs.has(item.slug)) {
      throw new HttpError(400, "VALIDATION_ERROR", "duplicate slug: " + item.slug);
    }
    seenSlugs.add(item.slug);
    validItems.push(item);
  }

  const schema = await loadCertificateSchema();
  const updatePromises = validItems.map((item) =>
    db.collection(COLLECTION_NAME).updateOne(
      { slug: item.slug },
      { $set: { displayOrder: item.displayOrder, updatedAt: new Date().toISOString() } }
    )
  );
  await Promise.all(updatePromises);

  // Return the updated certificates
  const slugs = validItems.map((item) => item.slug);
  const docs = await db.collection(COLLECTION_NAME).find({ slug: { $in: slugs } }).toArray();
  return schema.normalizeCertificates(docs);
}

/***
 * List all certificates with status `published`. For public API use only.
 * @param {import("mongodb").Db} db
 * @returns {Promise<Array>}
 */
async function listPublishedCertificates(db) {
  const collection = db.collection(COLLECTION_NAME);
  const docs = await collection.find({ status: "published" }).toArray();
  const schema = await loadCertificateSchema();
  return schema.normalizeCertificates(docs);
}

/***
 * Find a published certificate by slug. For public API use only.
 * @param {import("mongodb").Db} db
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
async function findPublishedCertificateBySlug(db, slug) {
  if (!isValidSlug(slug)) return null;
  const collection = db.collection(COLLECTION_NAME);
  const raw = await collection.findOne({ slug, status: "published" });
  if (!raw) return null;
  const schema = await loadCertificateSchema();
  return schema.normalizeCertificate(raw);
}

/***
 * Find a certificate by slug (any status). For admin use only.
 * @param {import("mongodb").Db} db
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
async function findCertificateBySlug(db, slug) {
  if (!isValidSlug(slug)) return null;
  const collection = db.collection(COLLECTION_NAME);
  const raw = await collection.findOne({ slug });
  if (!raw) return null;
  const schema = await loadCertificateSchema();
  return schema.normalizeCertificate(raw);
}
module.exports = {
  COLLECTION_NAME,
  SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  isValidSlug,
  referencedPublicIds,
  listPublishedCertificates,
  findPublishedCertificateBySlug,
  listAllCertificates,
  findCertificateBySlug,
  findRawCertificateBySlug,
  nextOrder,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  setStatus,
  reorderCertificates,
  ensureSlugIndex,
  ensureCertificateIndexes,
  isDuplicateKeyError,
  asString,
  asStringArray,
};