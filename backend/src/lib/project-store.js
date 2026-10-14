/**
 * Access to the `projects` collection.
 *
 * Public reads (`listPublishedProjects`, `findPublishedProjectBySlug`) are used
 * by the JSON API and the server-rendered pages. Admin reads and writes
 * (`listAllProjects`, `findProjectBySlug`, `createProject`, `updateProject`,
 * `deleteProject`, `setStatus`) back the private CMS.
 *
 * All normalization is delegated to the single shared schema
 * (`js/projects-schema.js`) so the slugs and publication rules used by the API,
 * the browser listing and the server-rendered pages can never drift apart.
 *
 * A project is publicly visible only when the shared schema considers it
 * `published` (an explicit non-"published" `status` — e.g. "draft" — is hidden).
 */

'use strict';

const { loadProjectSchema } = require('./project-schema');
const { HttpError } = require('./errors');

const COLLECTION_NAME = 'projects';

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
 * List every published project, normalized and ordered by the shared schema.
 * @param {import('mongodb').Db} db
 * @returns {Promise<object[]>}
 */
async function listPublishedProjects(db) {
  const schema = await loadProjectSchema();
  const docs = await db.collection(COLLECTION_NAME).find({}).toArray();
  return schema.publishedProjects(schema.normalizeProjects(docs));
}

/**
 * Resolve a single published project by its slug.
 *
 * Documents that store an explicit `slug` field are matched directly. For
 * documents that predate the field, the slug is derived from the title with the
 * same algorithm the browser uses, so existing projects keep working.
 *
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @returns {Promise<object|null>} The normalized project or null.
 */
async function findPublishedProjectBySlug(db, slug) {
  if (!isValidSlug(slug)) return null;

  const schema = await loadProjectSchema();
  const collection = db.collection(COLLECTION_NAME);

  const directMatches = await collection.find({ slug }).toArray();
  const candidateDocs = directMatches.length > 0
    ? directMatches
    : await collection.find({}).toArray();

  const published = schema.publishedProjects(schema.normalizeProjects(candidateDocs));
  return published.find((project) => project.slug === slug) || null;
}

/**
 * List every project (drafts included) for the admin dashboard.
 * @param {import('mongodb').Db} db
 * @returns {Promise<object[]>}
 */
async function listAllProjects(db) {
  const schema = await loadProjectSchema();
  const docs = await db.collection(COLLECTION_NAME).find({}).toArray();
  return schema.normalizeProjects(docs);
}

/**
 * Resolve a single project by slug regardless of status (admin/preview).
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
async function findProjectBySlug(db, slug) {
  if (!isValidSlug(slug)) return null;

  const schema = await loadProjectSchema();
  const collection = db.collection(COLLECTION_NAME);

  const direct = await collection.findOne({ slug });
  const candidates = direct ? [direct] : await collection.find({}).toArray();
  const normalized = schema.normalizeProjects(candidates);
  return normalized.find((project) => project.slug === slug) || null;
}

/**
 * Find the raw stored document for a slug (so it can be updated/deleted by id).
 * Falls back to a derived-slug scan for documents without a stored `slug`.
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
async function findRawProjectBySlug(db, slug) {
  if (!isValidSlug(slug)) return null;

  const collection = db.collection(COLLECTION_NAME);
  const direct = await collection.findOne({ slug });
  if (direct) return direct;

  const schema = await loadProjectSchema();
  const docs = await collection.find({}).toArray();
  const match = schema.normalizeProjects(docs).find((project) => project.slug === slug);
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
    .map((doc) => Number(doc.order))
    .filter((value) => Number.isFinite(value));
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

/**
 * Insert a new project document.
 * @param {import('mongodb').Db} db
 * @param {object} doc - Built by `lib/admin-projects.js` (includes `slug`).
 * @param {Date} [now]
 * @returns {Promise<object>} The normalized created project.
 * @throws {HttpError} 409 when the slug already exists.
 */
async function createProject(db, doc, now = new Date()) {
  const timestamp = now.toISOString();
  const stored = { ...doc, createdAt: timestamp, updatedAt: timestamp };

  try {
    await db.collection(COLLECTION_NAME).insertOne(stored);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new HttpError(409, 'SLUG_CONFLICT', `A project with slug "${doc.slug}" already exists`);
    }
    throw err;
  }

  const schema = await loadProjectSchema();
  return schema.normalizeProject(stored, 0);
}

/**
 * Update an existing project by its current slug.
 * @param {import('mongodb').Db} db
 * @param {string} slug - Current slug.
 * @param {object} doc - Full replacement document (without _id/timestamps).
 * @param {Date} [now]
 * @returns {Promise<object|null>} The updated normalized project, or null if missing.
 */
async function updateProject(db, slug, doc, now = new Date()) {
  const raw = await findRawProjectBySlug(db, slug);
  if (!raw) return null;

  const updatedAt = now.toISOString();
  try {
    await db
      .collection(COLLECTION_NAME)
      .updateOne({ _id: raw._id }, { $set: { ...doc, updatedAt } });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new HttpError(409, 'SLUG_CONFLICT', `A project with slug "${doc.slug}" already exists`);
    }
    throw err;
  }

  return findProjectBySlug(db, doc.slug);
}

/**
 * Delete a project by slug.
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @returns {Promise<boolean>} True when a document was removed.
 */
async function deleteProject(db, slug) {
  const raw = await findRawProjectBySlug(db, slug);
  if (!raw) return false;

  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: raw._id });
  return result.deletedCount > 0;
}

/**
 * Set a project's publication status.
 * @param {import('mongodb').Db} db
 * @param {string} slug
 * @param {'published'|'draft'} status
 * @param {Date} [now]
 * @returns {Promise<object|null>} The updated normalized project, or null if missing.
 */
async function setStatus(db, slug, status, now = new Date()) {
  const raw = await findRawProjectBySlug(db, slug);
  if (!raw) return null;

  await db
    .collection(COLLECTION_NAME)
    .updateOne({ _id: raw._id }, { $set: { status, updatedAt: now.toISOString() } });

  return findProjectBySlug(db, slug);
}

/** Cache index-creation promises per Db handle (WeakMap keeps tests isolated). */
const slugIndexPromises = new WeakMap();

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

module.exports = {
  COLLECTION_NAME,
  SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  isValidSlug,
  listPublishedProjects,
  findPublishedProjectBySlug,
  listAllProjects,
  findProjectBySlug,
  findRawProjectBySlug,
  nextOrder,
  createProject,
  updateProject,
  deleteProject,
  setStatus,
  ensureSlugIndex,
  isDuplicateKeyError,
};
