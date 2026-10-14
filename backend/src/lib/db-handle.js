/**
 * Single shared database handle for the API.
 *
 * Both the read-only content endpoint (`routes/projects.js`) and the
 * server-rendered project pages (`routes/project-pages.js`) resolve the same
 * `Db` instance here, so there is exactly one database access point.
 *
 * The handle is injected by `src/index.js` once the MongoDB connection is
 * established, and can be replaced by tests with a mock/double.
 */

let dbInstance = null;

/**
 * Inject the active database handle (or `null` to clear it).
 * @param {import('mongodb').Db | null} db
 */
function setDb(db) {
  dbInstance = db || null;
}

/**
 * @returns {import('mongodb').Db | null} The active database handle, if any.
 */
function getDb() {
  return dbInstance;
}

module.exports = {
  setDb,
  getDb,
};
