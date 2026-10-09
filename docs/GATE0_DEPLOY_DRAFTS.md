# Gate 0 Deployment Drafts — NOT APPLIED (dashboard actions require owner approval)

## Vercel (staging)

* Create project from `KAOS-CODM/isaiahwebdev`, **Root Directory = `api`**.
* Draft `vercel.json` (to be placed at `api/vercel.json` at implementation time):
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "ignoreCommand": "git diff --quiet HEAD^ HEAD -- api/ admin/"
  }
  ```
  Effect: content-only commits touching the static portfolio skip Vercel builds.
* Environment: staging only — `MONGODB_URI` (staging DB), `SESSION_PEPPER`, `PUBLIC_SITE_URL` (staging URL).

## Render (staging)

* Create a **separate** staging static service pinned to branch `staging`.
  Production service stays on `main` and is never touched by Gate 0.

## Atlas (staging)

* Create database `portfolio_staging` + least-privilege user (readWrite on that
  database only); allowlist Vercel egress. TTL index for rate-limit buckets is
  created by the Gate 1 migration, not here.

## GitHub

* Path-guard workflow remains a draft (`path-guard.draft.yml`) and must NOT be
  enabled as a required check until it exists and passes its own tests.
* No App installation, no branch-protection changes in Gate 0.

## Open routing item (required before Gate 1 acceptance)

* JSON 404 for unknown API routes is a required behavior, but no catch-all
  function or `rewrites` configuration is implemented in this micro-correction.
* An explicit catch-all or routing configuration must be implemented and
  verified on the staging deployment before Gate 1 is accepted. Until then,
  unknown paths return the platform-default response.
