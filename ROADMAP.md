# ROADMAP.md

Project roadmap, milestone tracking, and decision log for the IsaiahWebDev portfolio CMS project.

---

## Project Objective

Add a remote content-management capability to the existing portfolio while preserving the original static frontend.

**Target arrangement:**
- **Frontend**: Original static portfolio (HTML/CSS/JS) deployed as a Render Static Site. No changes to routes, design, SEO, or deployment unless explicitly approved.
- **Backend API**: Separate Node.js service deployed as a Render Web Service. In production it is API-only and does not serve frontend assets. For local development it may serve the public frontend from an explicit allowlist so the portfolio and API run through one local server (approved 2026-10-14); this does not change the production boundary.
- **Database**: MongoDB Atlas for CMS content.
- **Admin dashboard**: Private interface for the owner to manage portfolio content.
- **Media**: Cloudinary may be introduced in a later approved milestone.

---

## Current Baseline

- **Repository**: `C:\Users\KAOS\Programs\html\isaiahwebdev`
- **Branch**: `main`
- **HEAD commit**: `d01843d286da18ad9c3a9ad35cc34e3bf6718797` ("updated SEO metatags")
- **Status**: Verified clean working tree. Original portfolio files confirmed present.
- **Recovery artifacts preserved**:
  - Archive: `isaiahwebdev-recovery-20261012-025302.zip`
  - Env backup: `isaiahwebdev-env-recovery-20261012-025941.env`
  - Branch: `backup/staging-cms-before-reset` → `3277d8f`
  - Branch: `staging` (local & remote)
  - Stash: `stash@{0}: On staging: staging-cms-wip-`

The original static frontend must be preserved. All implementation builds on this baseline.

---

## Milestone Sequence

Each milestone is **Proposed** — not automatically approved. Writing this roadmap does not authorize implementation. Each phase requires its own scoped task and acceptance criteria before work begins.

### Milestone 0: Governance and Baseline ✅ *Current*
- **Objective**: Establish project rules, roadmap, and verify the original portfolio baseline.
- **Scope**: Create `WORKFLOW_BRAIN.md` and `ROADMAP.md`. Verify repository state. No application changes.
- **Acceptance criteria**:
  - Both documents exist with required sections.
  - No other files modified.
  - Git status clean.
  - Preflight checks pass.
- **Dependencies**: None.
- **Status**: Complete.

---

### Milestone 1: Minimal API Foundation
- **Objective**: Create an isolated Node.js API service with a health endpoint and predictable error handling.
- **Scope**:
  - Add `backend/` directory with its own `package.json`.
  - Implement `GET /health` returning `{ ok: true }`.
  - Return JSON errors for unknown API routes (not frontend pages).
  - Add local tests for health endpoint and 404 behavior.
- **Acceptance criteria**:
  - `backend/` runs locally with `node backend/src/index.js` (or equivalent).
  - `GET /health` returns 200 with JSON.
  - Unknown API routes return 404 JSON, not HTML.
  - Tests pass with `node --test`.
  - No database connection.
  - Frontend unaffected.
- **Dependencies**: Milestone 0 complete.
- **Status**: Complete.

---

### Milestone 2: Database Connection
- **Objective**: Configure MongoDB Atlas connection through environment variables with safe failure handling.
- **Scope**:
  - Add MongoDB driver dependency.
  - Configure connection via `MONGODB_URI` environment variable.
  - Implement connection lifecycle (connect on startup, close on shutdown).
  - Handle connection failures without crashing the API.
  - Test connection behavior (success, invalid URI, network failure) without destructive database operations.
- **Acceptance criteria**:
  - API starts and connects to MongoDB Atlas when `MONGODB_URI` is valid.
  - API logs clear error and remains responsive when `MONGODB_URI` is invalid or unreachable.
  - No collections created, no data written.
  - Tests cover connection success and failure paths.
- **Dependencies**: Milestone 1 complete; MongoDB Atlas cluster provisioned (user action).
- **Status**: Complete.

---

### Milestone 3: Read-Only Content API
- **Objective**: Define the minimal content model and implement read-only API endpoints.
- **Scope**:
  - Define content schema for one portfolio type (e.g., projects).
  - Implement `GET /api/content/projects` returning validated, sanitized data.
  - Return appropriate HTTP codes: 200, 404, 500.
  - Validate and sanitize all returned data.
  - Verify behavior when data is missing or invalid.
- **Acceptance criteria**:
  - Endpoint returns valid JSON matching defined schema.
  - Empty collection returns empty array (not 404).
  - Invalid data in database is sanitized, not exposed.
  - Tests cover success, empty, and malformed data cases.
- **Dependencies**: Milestone 2 complete.
- **Status**: Complete.

---

### Milestone 4a: Frontend Consumption Strategy (Decision Gate)
- **Objective**: Decide how the static frontend will consume CMS API data.
- **Scope**:
  - Evaluate client-side fetch, build-time generation, and hybrid approaches.
  - Document trade-offs: SEO impact, caching, fallback behavior, complexity.
  - Obtain user decision on the chosen strategy.
  - No implementation in this milestone.
- **Acceptance criteria**:
  - Decision documented with rationale.
  - Fallback to `data/*.json` files confirmed as baseline behavior.
  - No code changes.
- **Dependencies**: Milestone 3 complete.
- **Status**: Complete.

---

### Milestone 4b: Frontend Integration
- **Objective**: Implement the chosen frontend integration strategy with fallback.
- **Scope**:
  - Implement the approved consumption strategy (client-side fetch, build-time, or hybrid).
  - Preserve fallback to `data/*.json` files when API unavailable.
  - Preserve original design, routes, metadata, SEO, and existing behavior.
  - Investigate rendering and indexing implications before changing content delivery.
  - Handle one content type at a time (projects first).
- **Acceptance criteria**:
  - Portfolio loads and displays CMS content when API available.
  - Portfolio falls back to static JSON when API unavailable.
  - No visual or functional regression in design, routes, or SEO.
  - No content type migrated automatically; incremental approach verified.
- **Dependencies**: Milestone 4a decision complete.
- **Status**: Complete.

---

### Milestone 5: Admin Authentication
- **Objective**: Implement secure authentication for a single administrator.
- **Scope**:
  - Choose authentication strategy based on real deployment origins and security requirements.
  - Implement authorization middleware protecting all administrative endpoints.
  - Secure session/token handling appropriate to chosen strategy.
  - Test unauthenticated and unauthorized access (must be rejected).
- **Acceptance criteria**:
  - Admin can authenticate and receive valid session/token.
  - Unauthenticated requests to admin endpoints return 401/403.
  - Invalid/expired sessions return 401.
  - No credentials exposed in logs or client-side code.
  - Security tests cover negative cases.
- **Dependencies**: Milestone 1 complete; admin route definitions and access requirements from Milestone 3 established.
- **Status**: Implemented (Phase A) — pending review. See decision log 2026-10-14.

---

### Milestone 6: Admin Dashboard
- **Objective**: Build the minimum private interface to manage portfolio content.
- **Scope**:
  - Create dashboard UI for agreed content types (starting with projects).
  - Implement create/read/update/delete for content entries.
  - Validate inputs server-side and client-side.
  - Provide clear success and error states.
  - Protect all administrative API operations with auth from Milestone 5.
- **Acceptance criteria**:
  - Owner can create, edit, and delete projects via dashboard.
  - Changes reflected in API immediately.
  - Invalid input rejected with helpful messages.
  - Unauthorized access blocked.
  - Dashboard not publicly discoverable or accessible.
- **Dependencies**: Milestones 3 and 5 complete.
- **Status**: Implemented (Phase A) — pending review. See decision log 2026-10-14.

---

### Milestone 7: Media Management
- **Objective**: Evaluate and, if approved, integrate Cloudinary for image uploads.
- **Scope**:
  - Evaluate Cloudinary vs. alternatives against requirements.
  - If approved: implement secure upload authorization, file type/size validation, and deletion.
  - Keep media secrets server-side only.
  - Update content model to reference media URLs.
- **Acceptance criteria**:
  - Uploads work for approved image types within size limits.
  - Invalid files rejected.
  - Deletion removes media from Cloudinary.
  - No secrets exposed client-side.
  - Costs reviewed and approved before integration.
- **Dependencies**: Milestone 6 complete; Cloudinary account provisioned (user action).
- **Status**: Proposed (deferred; requires explicit cost and account approval).

---

### Milestone 8: Deployment and Verification
- **Objective**: Configure and deploy the separate API service; verify end-to-end operation.
- **Scope**:
  - Configure Render Web Service for the API.
  - Set environment variables, CORS, allowed origins, health checks based on actual deployment config.
  - Verify frontend and backend work together in production.
  - Document deployment and rollback procedures.
- **Acceptance criteria**:
  - API deployed and accessible at configured URL.
  - Health endpoint passes Render health checks.
  - Frontend static site remains fully operational.
  - CMS content loads in production frontend.
  - Rollback procedure documented and tested.
  - Deployment only with explicit approval.
- **Dependencies**: Milestones 1–7 complete (or subset approved for MVP).
- **Status**: Proposed.

---

## Project Status

| Field | Value |
|-------|-------|
| **Current milestone** | 5–6 — Admin authentication and dashboard (Phase A) |
| **Current status** | Implemented (Phase A) — awaiting review |
| **Completed work** | Milestones 1–4b (API foundation, DB, read-only content API, frontend integration with fallback and server-rendered `/projects/<slug>`); unified local static serving. Phase A admin: database-backed single-admin setup + username/password login, project CRUD, publish/unpublish, authenticated previews, admin UI, unique slug index |
| **Open blockers/decisions** | Cloudinary (M7) requires explicit cost/account approval; production deployment (M8) not authorized |
| **Next proposed action** | Review the Phase A implementation and results |
| **Implementation authorization** | **Phase A only** was authorized; no other milestone implementation is authorized |

---

## Local Checkpoint

A local Git checkpoint was taken to preserve the current working version before starting the next CMS milestone.

| Field | Value |
|-------|-------|
| **Base commit (pre-checkpoint)** | `d01843d286da18ad9c3a9ad35cc34e3bf6718797` |
| **Checkpoint commit** | Recorded in `git log` after this commit; it is not embedded here because a commit cannot contain its own hash |
| **Purpose** | Preserve the working local version: static frontend and backend running together; database-backed single-admin cookie sessions that persist across page refreshes and server restarts; the admin dashboard supporting project creation and management; the existing Site Scout draft |
| **Test status (verified 2026-10-14)** | Backend `node --test --test-concurrency=1` → 140 pass / 0 fail; repo root `node --test --test-concurrency=1` → 175 pass / 0 fail (the root run also discovers the backend tests; there is no root `package.json`, so the root suite is not run via `npm test`) |
| **Next milestone** | M6 Phase B — expand the project schema, the admin editor, and the public project-detail pages. Cloudinary uploads (M7) remain a subsequent milestone. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-12 | Original static portfolio must be preserved | Primary product; existing deployment must not be disrupted |
| 2026-10-12 | Frontend and API are separate services | Clear separation of concerns; independent deployment; frontend remains static |
| 2026-10-12 | MongoDB Atlas is the planned database | Managed, scalable, familiar; matches project requirements |
| 2026-10-12 | Cloudinary is a later, conditional milestone | Media management not needed for MVP; defer cost and complexity |
| 2026-10-12 | Work is milestone-gated and scope is strict | Prevents scope creep, ensures review checkpoints, protects baseline |
| 2026-10-12 | User decides material architecture, scope, and cost questions | Final authority on trade-offs affecting product, budget, or security |
| 2026-10-12 | No automatic progression to next milestone | Each milestone requires explicit review and approval |
| 2026-10-12 | Old CMS implementation not restored or reused by default | Fresh start avoids inherited complexity and technical debt |
| 2026-10-12 | Existing recovery artifacts must remain untouched | Preserves ability to inspect or recover prior work if needed |
| 2026-10-14 | Backend may serve the public frontend locally from an explicit allowlist; production stays API-only | Enables unified local development through one server while keeping the separate production deployment boundary intact |
| 2026-10-14 | Single-administrator auth is database-backed and browser-provisioned (supersedes the initial env-var approach): the administrator record (username, salted scrypt password hash, per-admin random token secret) is stored in MongoDB (`admins`, fixed `_id` `"admin"`); stateless HMAC-SHA256 bearer tokens (8-hour expiry) are signed with the per-admin secret via Node built-in `crypto` | Removes the mandatory credential/signing secrets from the environment, stores no plaintext password, needs no new dependencies and no server-side session store, and matches the single-owner requirement |
| 2026-10-14 | First-admin setup (`GET /api/admin/bootstrap`, `POST /api/admin/setup`) is available only to loopback clients while `NODE_ENV` is not `production`, is rate limited, and is permanently closed once the administrator exists (atomic fixed `_id`) | Prevents unauthorised public claiming of the single administrator account without exposing an open signup endpoint; production onboarding is done locally against the shared database |
| 2026-10-14 | Login requires username + password; the retired `ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET` environment variables and the `hash-password` script are removed | Normal operation must not depend on a bootstrap secret in the environment; the database is the single source of truth |
| 2026-10-14 | Project media is referenced by URL only in Phase A; uploads (Cloudinary) remain in M7 | Avoids a cost/account commitment and keeps Phase A scope closed |
| 2026-10-14 | Logout clears the session cookie; the underlying token remains valid until expiry | Stateless tokens cannot be revoked without server-side state; early revocation deferred and documented |
| 2026-10-14 | Admin sessions are carried by a signed `HttpOnly` session cookie (`Path=/api/admin`, 8-hour expiry) instead of an in-memory bearer token; `SameSite=None; Secure` in production (separate static/API sites), `SameSite=Lax` locally, overridable via `ADMIN_COOKIE_SAMESITE`; bearer headers remain accepted for API clients | Persists login across page refreshes and server restarts without storing tokens in `localStorage`/`sessionStorage`; `HttpOnly` blocks JS access and the strict CORS/JSON-content-type checks plus the SameSite attribute mitigate CSRF |
| 2026-10-14 | Login attempts are rate limited in memory (5 per 15 minutes per client address) | Slows brute-force attempts without new infrastructure; per-instance state is an accepted Phase A limitation |
| 2026-10-14 | Duplicate project slugs are rejected with `409 Conflict`; a unique index (`slug_unique`) is created on `projects.slug` | Prevents ambiguous public URLs; verified safe because the collection did not previously exist |
| 2026-10-14 | Admin UI (`admin.html`, `js/admin-api.js`, `js/admin.js`) is part of the static frontend; the production backend stays API-only | Keeps the cross-origin boundary explicit and avoids serving admin pages from the API service |
| 2026-10-14 | Public read-only `GET /api/content/projects` accepts requests with no `Origin` header; the CORS allowlist still governs cross-origin responses | Same-origin browser fetches omit `Origin`, so the endpoint would otherwise be unreachable and the listing would silently fall back to static JSON; scoped to this public read-only endpoint only | the CORS allowlist still governs cross-origin responses | Same-origin browser fetches omit `Origin`, so the endpoint would otherwise be unreachable and the listing would silently fall back to static JSON; scoped to this public read-only endpoint only |

---

## Undecided / Deferred

- **Resolved (Phase A, 2026-10-14):** authentication mechanism (single-admin, stateless HMAC token delivered in an HttpOnly session cookie). Remaining: MFA and multi-user roles.
- Exact content schema for each portfolio type (Phase A defines the core project schema; refinements deferred)
- Frontend consumption strategy (client-side fetch vs. build-time vs. hybrid)
- Environment variable naming convention (e.g., `APP_`, `CMS_` prefix)
- Cloudinary integration (depends on Milestone 7 evaluation)
- Custom domain, SSL, CDN configuration
- Monitoring, logging, alerting strategy
- Backup and disaster recovery procedures for database
- **Partially resolved (Phase A, 2026-10-14):** login rate limiting (in-memory, per instance). Remaining: distributed brute-force and DoS protection.
- CI/CD pipeline configuration

These items will be decided when their respective milestones are planned.