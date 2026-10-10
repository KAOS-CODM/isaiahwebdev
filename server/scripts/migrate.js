'use strict';

/**
 * scripts/migrate.js — CLI schema initializer (Gate 1).
 *
 *   MONGODB_URI="mongodb+srv://.../portfolio_staging?..." node scripts/migrate.js
 *
 * Package-root note: run from the repository root (e.g. `npm run migrate`).
 * Exit codes: 0 ok, 2 configuration error, 1 operational failure.
 * Prints a JSON report; never prints the connection string.
 */

const { createMongoPool, toSafeDbError } = require('../lib/mongo');
const { ensureSchema } = require('../lib/migrate');

async function main(env = process.env) {
  const pool = createMongoPool({ env });
  let db;
  try {
    db = await pool.getDb();
  } catch (err) {
    const safe = toSafeDbError(err);
    console.error(JSON.stringify({ ok: false, error: { code: safe.code, message: safe.message } }));
    process.exitCode = err && err.code === 'DB_URI_INVALID' ? 2 : err && err.code === 'DB_UNCONFIGURED' ? 2 : 1;
    return;
  }
  try {
    const report = await ensureSchema(db);
    console.log(JSON.stringify({ ok: true, report }));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: { code: 'MIGRATION_FAILED', message: 'Schema initialization failed.' } }));
    process.exitCode = 1;
  } finally {
    try {
      const client = await pool.getClient();
      await client.close();
    } catch {
      // Best effort: report already records the outcome.
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
