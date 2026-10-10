# Gate 1 Migration Strategy — MongoDB schema initialization

## Local setup (staging, your machine)

1. Fill in `api/.env` locally with your staging Atlas URI. The database name
   in the URI must be `portfolio_staging`. The file is ignored by Git
   (`.gitignore` `.env` rule) — verify with `git check-ignore -v api/.env`
   and never commit it.
2. No extra dependencies needed: `npm run migrate` loads `api/.env` via
   Node's built-in `--env-file` (Node 20.6+, verified on Node 22).

## Safe local commands

Run from the repository root. The migrator prints a JSON report and never
prints the connection string.

```powershell
# 1. First run — creates missing collections/indexes (expect ok:true)
npm run migrate --prefix api

# 2. Second run — must report empty createdCollections/createdIndexes
npm run migrate --prefix api

# 3. Re-run the unit suite (no live database required)
npm test --prefix api
```

Before step 1, confirm the URI's database segment reads `portfolio_staging`
(mongosh/Compass connection string preview, or your Atlas dashboard) — the
migrator operates on whatever database the URI names and cannot undo writes
elsewhere. If the URI is blank or malformed, the command exits `2` with a
`DB_UNCONFIGURED` / `DB_URI_INVALID` JSON error and changes nothing.

## What it does

`api/lib/migrate.js` (`ensureSchema(db)`) creates the collections and indexes
the CMS needs, and nothing else:

* `RateLimit` + TTL index `ttl_expiresAt` (login rate-limit buckets).
* `PublishJob` + unique `uniq_idempotencyKey` and `idx_status_updatedAt`
  (durable publish jobs per `docs/PUBLISH_RECOVERY_CONTRACT.md`).

## Safety properties

* **Additive only:** `listCollections` → `createCollection` / `createIndex`
  for missing items. No `drop`, `deleteMany`, `deleteOne`, or document writes.
* **Repeatable:** a second run reports empty `createdCollections` /
  `createdIndexes` and changes nothing (covered by automated tests).
* **Database-scoped:** operates only on the handle it receives. Staging wiring
  points that handle at `portfolio_staging` via the database name in
  `MONGODB_URI`. The mechanism never selects or switches databases, so it
  cannot touch production data as long as the URI is staging (verify step 2).
* **No HTTP surface:** runs as CLI (`npm run migrate --prefix api`,
  `api/scripts/migrate.js`) because no admin authentication exists yet.
  Exit codes: 0 ok, 2 configuration error, 1 operational failure. Output is a
  JSON report; connection strings are never printed.

## Staging verification steps (dashboard actions by owner)

1. Set staging `MONGODB_URI` (database `portfolio_staging`) in Vercel staging env.
2. Confirm the URI database name is `portfolio_staging` before running anything.
3. Run the migrator against staging; expect `{ ok: true, report }`.
4. Run it a second time; expect empty `createdCollections`/`createdIndexes`.
5. Confirm in Atlas: collections exist with the three indexes; no other
   collections/documents were created, modified, or deleted.
6. `GET /api/health` still returns 200 with the documented shape.
