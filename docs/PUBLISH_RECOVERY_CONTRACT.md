# Publish-Job Recovery Contract (Gate 0 — normative for Gate 2)

Chained function-to-function invocation is an optimization only. The Atlas
`PublishJob` document is the sole authority for resume, retry, and
deduplication. No Gate 2 implementation may depend on in-memory state,
function offen execution overlap, or chained-call delivery.

## Job document

`PublishJob { _id: jobId (client UUID), projectId, slug, expectedTreeHash,
idempotencyKey: "{projectId}:{expectedTreeHash}", status, commitSha,
renderDeployId, attemptCount, leaseHolder, leaseExpiresAt, log[], version,
createdAt, updatedAt }`

Statuses: `queued → committing → committed → deploying → deployed →
verifying → verified`, plus `failed:{stage}` (e.g. `failed:commit`,
`failed:deploy`, `failed:verify`). Only `verified` means live.

## Rules

1. Create-before-work: the job row (status `queued`) exists before any commit.
2. Same `idempotencyKey` returns the existing job; no second job, no second commit.
3. Stage advance requires holding the lease: atomic
   `findOneAndUpdate({ _id, leaseExpiresAt: { $lt: now } }, { $set: { leaseHolder, leaseExpiresAt } })`.
4. Reconcile-first resume: before creating a commit, look up commits containing
   `job:{jobId}` and compare the remote tree hash to `expectedTreeHash`. Match →
   adopt the SHA and continue. No match → exactly one new commit.
5. Stale = status not in (`verified`, `failed:terminal`) AND
   (`leaseExpiresAt < now` OR `updatedAt < now - 5min`). Any authorized caller
   (cron, Actions sweep, manual resume) may re-lease and replay from the stored
   stage — all three invoke the same `resumeStaleJobs()` handler.
6. Verification requires fetching the live URL + sitemap and asserting HTTP 200
   plus the embedded `slug` and `expectedTreeHash` markers. Deploy success
   without verification success stays `failed:verify`, never `verified`.
7. Bounded retries (≈5, exponential backoff), then terminal failure with the
   per-stage log preserved. Retries reuse the same `jobId`/`idempotencyKey`.
8. Drafts are never rendered into the publish tree; the generator queries
   published-only records.
