# WORKFLOW_BRAIN.md

Project governance and safety rules for the IsaiahWebDev portfolio CMS project.

---

## Project Boundaries

- **Existing portfolio**: The original static portfolio is the primary product and must remain fully functional at all times.
- **Frontend deployment**: The existing frontend remains a Render Static Site (GitHub Pages origin). Its deployment must not be disrupted.
- **CMS API**: A separate Node.js API service deployed as a Render Web Service. In production it is API-only and must not serve frontend HTML, CSS, JavaScript, images, or other static assets; the frontend and backend deploy separately. **Local development exception (2026-10-14):** the native Node HTTP backend may serve the public frontend from an explicit public-file/directory allowlist so the portfolio and API run through one local server. This exception is local-only, is never enabled in production (gated on `NODE_ENV=production`), and never exposes backend internals, secrets, tests, or documentation. The existing exception for server-rendered, published `/projects/<slug>` pages is unchanged.
- **CORS policy**: The API must enforce an explicit CORS allowlist for approved frontend origins. Do not use wildcard origins in production.
- **Database**: MongoDB Atlas for CMS content storage.
- **Admin dashboard**: A private dashboard for the owner to manage portfolio content remotely.
- **Media management**: Cloudinary may be introduced in a later approved milestone.
- **Preservation**: Existing routes, content, design, metadata, SEO, and deployment behavior must remain intact unless a change is explicitly approved.
- **No assumptions**: Do not assume a custom domain, paid service tier, specific authentication mechanism, or any other unconfirmed requirement.

---

## Roles

| Role | Responsibilities |
|------|------------------|
| **ChatGPT** | Product planning, requirements, architecture guidance, complete OpenCode prompts, and review of reported results. |
| **OpenCode** | Code implementation, file changes, local testing, inspection, and reporting within the authorized task. |
| **User** | Final authority on scope and meaningful technical decisions; runs commands when needed; approves consequential actions. |

OpenCode must not treat its own suggestions, test output, or architectural preferences as user authorization.
ChatGPT must not propose implementation prompts until the relevant project context has been checked and the next task is consistent with the approved roadmap.

---

## Scope Control

For every task, the following must be defined:
- **Objective**: What we are trying to accomplish.
- **Justification**: Why this belongs in the current milestone.
- **Allowed changes**: Specific files or areas permitted to change.
- **Prohibited changes**: Explicitly out-of-scope modifications.
- **Acceptance criteria**: How we know the task is complete.
- **Required verification**: Tests or checks that must pass.
- **Expected report**: What the completion report must contain.

OpenCode must not:
- Add features, refactor unrelated code, or introduce optional infrastructure.
- Reorganize working files or expand the task because an improvement seems useful.
- Install unrelated dependencies or run unnecessarily broad test suites.

If completing a task requires work outside the approved scope:
1. Stop and report what was discovered and why it matters.
2. Propose the smallest scope change.
3. List available alternatives.
4. Wait for authorization before proceeding.

---

## Milestone Workflow

Use this sequence for every milestone:

1. **Plan**: Read project context, verify repository state, define objective and acceptance criteria.
2. **Scope**: Identify risks, dependencies, and boundaries.
3. **Decide**: Obtain any necessary user decisions.
4. **Prompt**: Provide one complete implementation prompt.
5. **Implement**: Execute only the approved milestone.
6. **Test**: Run the agreed verification steps.
7. **Report**: Document actual changes, commands, results, limitations, and unresolved issues.
8. **Review**: Compare results against acceptance criteria.
9. **Recommend**: Propose the next milestone, but do not start it automatically.

**Passing tests makes a milestone eligible for review. It does not authorize the next milestone.**

Do not repeatedly reopen settled decisions unless new evidence materially changes the situation.

---

## Approval Boundaries

Routine implementation and local verification may proceed within an explicitly approved task.

**Explicit user approval required before:**
- Committing or pushing Git changes.
- Deploying to staging or production.
- Deleting branches, dropping stashes, rewriting Git history, or performing destructive Git recovery operations.
- Running database migrations or destructive/consequential database writes.
- Creating paid resources, starting subscriptions, or accepting unexpected usage charges.
- Changing deployment configuration or production environment variables.
- Making significant architectural changes outside the approved milestone.
- Performing irreversible operations or deleting work that may not be recoverable.
- **Changes to package dependencies (add/remove/upgrade), deployment configuration files, or database schemas.**

Approval for one task does not grant blanket approval for later protected actions.
Never claim approval has been granted when it has not.

---

## Balanced Architecture

- Prefer straightforward, maintainable solutions appropriate to the current project stage.
- Avoid speculative abstractions, unnecessary frameworks, duplicated services, premature microservices, redundant documentation, and unrelated refactoring.
- Consider realistic future requirements when choosing an approach, but implement future capabilities only when the roadmap reaches them.
- Explain meaningful architectural trade-offs in plain language. Recommend one option and explain why it fits the requirements.

---

## Git and Repository Safety

- Treat the original portfolio baseline (`d01843d`) as protected.
- Before implementation tasks, inspect the branch, HEAD, and working-tree status.
- Never blindly overwrite, discard, clean, reset, or restore work.
- Before risky operations, identify what could be lost and verify an appropriate recovery path.
- Do not use destructive commands as routine cleanup.
- Preserve existing branches, stashes, and recovery artifacts unless the user explicitly authorizes a separate operation involving them.
- Never assume an untracked file is disposable.
- Do not modify `.gitignore` unless explicitly authorized for a task.

---

## Security and Secrets

- Never print, expose, commit, or place secrets in documentation or logs. Use placeholders in examples.
- Keep environment files out of source control.
- Apply least privilege to database access and administrative operations.
- Do not weaken authentication, authorization, input validation, or other security controls to make a test pass.
- For security-sensitive work, include appropriate negative tests and verify unauthorized requests are rejected.
- If a credential may have been exposed, stop and report the concern without reproducing the credential.
- **Secret rotation procedures must be documented when the relevant credentials and services are introduced.** Do not implement rotation procedures speculatively; record the requirement and address it when the corresponding milestone is reached.
- **Admin CMS credentials (Phase A, 2026-10-14; database-backed sessions, 2026-10-14).** A single administrator is stored in MongoDB (`admins` collection, fixed `_id` `"admin"`) with a username, a salted scrypt password hash, and a per-admin random token-signing secret. No administrator password or signing secret is configured in the environment, and no plaintext password is stored. First-run setup is available only from a loopback client while `NODE_ENV` is not `production`, is rate limited, and becomes permanently unavailable once an administrator exists (enforced atomically by the unique `_id`). Sessions are stateless HMAC-SHA256 tokens (8-hour expiry) signed with the per-admin secret and delivered in a signed, `HttpOnly` cookie (`Path=/api/admin`), so they persist across page refreshes and server restarts without touching `localStorage`/`sessionStorage`; `SameSite=None; Secure` is used in production (separate static/API sites) and `SameSite=Lax` locally, overridable via `ADMIN_COOKIE_SAMESITE`. Bearer tokens remain accepted for API clients. Logout clears the cookie. Rotation: delete the administrator record and re-run local setup to change the password; deleting or replacing the record invalidates all outstanding sessions. No rotation endpoint is exposed.

---

## Testing and Evidence

- Use risk-based verification. Select checks appropriate to the affected functionality:
  - Automated tests
  - Manual HTTP checks
  - Build checks
  - Regression checks
  - Security tests
- Authentication, permissions, secrets handling, database changes, and payment-related functionality require more rigorous verification than presentation changes.
- **Report:**
  - Exact checks performed
  - Actual pass/fail results
  - Any checks not performed and why
  - Known limitations and remaining risks
- Never claim a test, database operation, or deployment succeeded without evidence.
- Do not install unrelated dependencies or run unnecessarily broad test suites when a smaller relevant set is sufficient.

---

## Rollback and Recovery

- For consequential changes, identify likely failure modes and the recovery approach before proceeding.
- Prefer reversible, incremental changes.
- Do not invent a rollback procedure that has not been verified as applicable.
- If implementation fails, preserve useful diagnostic evidence and stop before destructive recovery attempts.

---

## Cost and Deployment Discipline

- Prefer affordable options appropriate to the project's current stage.
- Do not assume a free tier is available, sufficient, or permanent without checking when the decision becomes relevant.
- Do not create paid resources or incur unexpected costs without approval.
- Verify locally before proposing deployment.
- Treat production deployment as a separate approval-gated operation. Local success does not imply production readiness.

---

## Rabbit-Hole Prevention

Before every new implementation task, answer:
1. What are we trying to accomplish?
2. Why is this necessary now?
3. What is the smallest adequate solution?
4. What is explicitly out of scope?
5. How will we know the task is complete?

If the proposed work does not advance the current milestone or address a demonstrated dependency, defer it.
Do not start optional features while a current acceptance criterion remains unmet.

---

## Documentation and Decisions

- `WORKFLOW_BRAIN.md` is the source of truth for collaboration and safety rules.
- `ROADMAP.md` is the source of truth for project phases, milestone status, acceptance criteria, blockers, and the next approved action.
- Keep documentation concise and consistent. Do not duplicate entire sections across documents.
- Record meaningful approved decisions in a short decision record in `ROADMAP.md`, including the choice and rationale.
- When a decision is superseded, update the record rather than silently contradicting it.

---

## Session-Start Protocol

At the beginning of every new work session:
1. Read `WORKFLOW_BRAIN.md`.
2. Read `ROADMAP.md`.
3. Check Git branch, HEAD, and working-tree status.
4. Review the latest recorded milestone results and blockers.
5. Confirm the next action is authorized and consistent with the roadmap.
6. Resolve any discrepancy before implementation.

Never assume previous tool context, a clean working tree, or a successful test result remains current without checking when it matters.

---

## Completion Protocol

A milestone is complete when:
- Its agreed acceptance criteria are satisfied.
- Relevant tests and verification have passed, or any exceptions have been explicitly documented.
- The implementation remains within scope.
- Changes and known issues are reported accurately.
- The roadmap status is updated when authorized and appropriate.

After reporting completion, wait for review before proposing or starting another implementation milestone.