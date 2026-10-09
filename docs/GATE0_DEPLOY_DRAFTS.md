# Gate 0 Deployment Drafts — NOT APPLIED (dashboard actions require owner approval)

## Vercel (staging)

* Create project from `KAOS-CODM/isaiahwebdev`, branch `staging`,
  **Root Directory = repository root** (default — do NOT set it to `api/`).
  With repo-root context the file routes map as intended:
  `api/health.js` → `/api/health`,
  `api/admin/publish/sweep.js` → `/api/admin/publish/sweep`,
  `api/admin/index.html` → `/api/admin/`.
* **Node runtime:** `api/package.json` is not the project-root manifest, so its
  `engines` field does not govern the deployment. Set the Node.js version
  explicitly in the Vercel dashboard (Project Settings → General → Node.js
  Version) to a currently supported LTS, and verify the selected version in the
  deployment's Build & Function logs before accepting staging.
* **Install/build:** Gate 0 declares zero dependencies (no root `package.json`,
  no lockfile), so the install step is a no-op and no build command is needed.
  Do not add a build command for Gate 0.
* **Ignore Command:** none configured for Gate 0. (The earlier draft command is
  withdrawn: its paths assumed a different working directory. Reintroduce one
  only with repo-root-relative paths once staging builds are observed.)
* **Static files:** this deployment also serves a duplicate copy of the static
  portfolio from the repo root. That copy is staging-only and informational —
  production remains on Render (`main` branch).
* Environment: staging only — `MONGODB_URI` (staging DB URI),
  `SESSION_PEPPER` (reserved, unused by Gate 0 code),
  `PUBLIC_SITE_URL` (staging deployment URL). Never production secrets.
* **Health check:** `GET /api/health` reports application/configuration state
  only (`db: "unconfigured"` vs `"not-checked"` reflects whether `MONGODB_URI`
  is set). It does not open a connection and does not verify live MongoDB
  connectivity; live DB checks arrive with Gate 1+.

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
