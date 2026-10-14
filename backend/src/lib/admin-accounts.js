/**
 * Access to the single administrator account (`admins` collection).
 *
 * There is exactly one administrator. Atomicity is enforced by MongoDB itself:
 * the account is stored under the fixed `_id` `"admin"`, and `_id` is always
 * unique, so two concurrent first-run setup requests can never both succeed —
 * the loser receives a duplicate-key error (translated to 403 SETUP_CLOSED).
 *
 * The stored document holds the username, a salted scrypt password hash and a
 * per-admin token-signing secret. The plaintext password is never stored, and
 * the document is never returned to a client.
 */

'use strict';

const { HttpError } = require('./errors');
const { hashPassword, verifyPassword, generateTokenSecret } = require('./admin-auth');

const COLLECTION_NAME = 'admins';

/** Fixed identifier: exactly one administrator can ever exist. */
const ADMIN_ID = 'admin';

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Password policy (no complexity rules; length is the primary defence). */
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

function invalid(message) {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}

function isDuplicateKeyError(err) {
  return Boolean(err) && (err.code === 11000 || err.code === 11001);
}

/**
 * @param {import('mongodb').Db} db
 */
function collection(db) {
  return db.collection(COLLECTION_NAME);
}

/**
 * Read the raw administrator document (never returned to a client).
 * @param {import('mongodb').Db} db
 * @returns {Promise<object|null>}
 */
async function getAdmin(db) {
  if (!db) return null;
  return collection(db).findOne({ _id: ADMIN_ID });
}

/**
 * Whether the initial administrator still needs to be created.
 * @param {import('mongodb').Db} db
 * @returns {Promise<boolean>}
 * @throws {HttpError} 503 when there is no database handle.
 */
async function isSetupRequired(db) {
  if (!db) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Content is temporarily unavailable');
  return (await getAdmin(db)) === null;
}

/**
 * Validate the first-run setup payload.
 * @param {unknown} input
 * @returns {{ username: string, password: string }}
 * @throws {HttpError} 400 when the payload is malformed or too weak.
 */
function validateSetupInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('Request body must be a JSON object');
  }

  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    throw invalid(`username must be between ${MIN_USERNAME_LENGTH} and ${MAX_USERNAME_LENGTH} characters`);
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw invalid('username may only contain letters, numbers, dots, underscores and hyphens');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw invalid(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw invalid(`password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }

  return { username, password };
}

/**
 * Create the one and only administrator account. Atomic: a concurrent second
 * call fails on the fixed `_id` and is reported as SETUP_CLOSED.
 * @param {import('mongodb').Db} db
 * @param {{ username: string, password: string }} credentials - Already validated.
 * @returns {Promise<object>} The stored administrator document.
 * @throws {HttpError} 403 when an administrator already exists; 503 without a database.
 */
async function createInitialAdmin(db, { username, password }) {
  if (!db) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Content is temporarily unavailable');

  const now = new Date();
  const doc = {
    _id: ADMIN_ID,
    username,
    passwordHash: hashPassword(password),
    tokenSecret: generateTokenSecret(),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await collection(db).insertOne(doc);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new HttpError(403, 'SETUP_CLOSED', 'Administrator setup is already complete');
    }
    throw err;
  }

  return doc;
}

/**
 * Verify a username/password pair against the stored administrator.
 * @param {import('mongodb').Db} db
 * @param {unknown} username
 * @param {unknown} password
 * @returns {Promise<object|null>} The administrator document, or null on failure.
 */
async function verifyCredentials(db, username, password) {
  const admin = await getAdmin(db);
  if (!admin) return null;
  if (typeof username !== 'string' || admin.username !== username) return null;
  if (typeof password !== 'string' || !verifyPassword(password, admin.passwordHash)) return null;
  return admin;
}

module.exports = {
  COLLECTION_NAME,
  ADMIN_ID,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
  USERNAME_PATTERN,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  getAdmin,
  isSetupRequired,
  validateSetupInput,
  createInitialAdmin,
  verifyCredentials,
  isDuplicateKeyError,
};
