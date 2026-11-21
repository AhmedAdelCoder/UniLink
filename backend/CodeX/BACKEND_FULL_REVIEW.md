# UniLink Backend Full Review

**Review date:** 2026-10-02  
**Mode:** Static, read-only review. No source/config/dependency/test/database/Git state changed.  
**Scope:** `backend/` inspected as read-only. Adjacent `api/sendemails.js` included as a deployed-function candidate because it is part of the project's backend-facing attack surface. No non-Firebase backend endpoint contacted.

## 1. Executive Summary

The Node backend is a **scaffold, not the intended student/recruiter API**. It contains a TypeScript Express app with Helmet, default CORS, JSON parsing and Morgan; one health endpoint; a Prisma/PostgreSQL schema with two migrations; and Mongoose schemas for social/chat data. It has **no auth, OAuth, authorization, product route, controller, service, repository, validator, or backend test implementation**. The separate Vercel-style SendGrid function sends a welcome email but has no caller authentication/rate limit.

- **Architecture:** Early stage; both database systems are initialized at startup; there is no app/domain layer or DI.
- **Security:** No API auth exists. Adjacent email handler accepts arbitrary recipient addresses and interpolates name into HTML; provider errors are returned to caller.
- **Performance:** No endpoint workloads exist to measure. Dual DB startup couples availability; future list APIs have no pagination contract.
- **Database:** PostgreSQL has good uniqueness for applications/follows and a migration enforcing non-self and unique active unordered connections. Role, token lookup, normalized email, and query index gaps remain. Mongo model indexes are declarations; deployed index state is unverified.
- **Testing:** No backend tests. API package test script is a placeholder that exits 1.
- **Main risks:** product API absent; TypeScript build/start setup not demonstrably runnable; Prisma config filename does not match default discovery; public email-sending surface; server requires both DBs despite no product routes.

No numeric score is assigned. Live deployment, database state, actual Mongo indexes, and Vercel env settings were not available and are not asserted.

## 2. Repository Architecture

### Actual contents/status

| Status | Components |
|---|---|
| Implemented | Express app in `backend/src/app.ts`; Helmet, default CORS, JSON parser, Morgan; `GET /api/v1/health`; startup PostgreSQL probe and Mongo connection |
| Partial | TypeScript env module; Prisma adapter/client; PostgreSQL schema and two migrations; Mongoose models for posts/comments/likes/chats/messages |
| Missing | Local auth, OAuth, JWT/refresh lifecycle, logout, RBAC, validation, product routes/controllers/services/repositories, global error handling, tests, API docs, monitoring |
| Adjacent | Vercel-style `api/sendemails.js`, using SendGrid |
| Unused in current backend source | Zod; Mongoose models (not imported from app/server); Prisma domain models (only raw startup probe used); Nodemon (no script) |
| Duplicated/legacy boundary | Separate `api/` package repeats Express dependency and has its own lockfile. Flutter/Firebase exists outside this backend; no migration/integration is present here. |

### Real flow

```text
Express: request → Helmet → default CORS → JSON parser → Morgan → GET /api/v1/health → JSON
Startup: env → PostgreSQL SELECT 1 → Mongo connect → listen
Email: POST /api/sendemails → email/name → SendGrid → response
```

No current route calls Prisma domain models or Mongoose models.

## 3. Critical Findings

| ID | Severity | Area | File | Problem | Impact | Recommendation |
|---|---|---|---|---|---|---|
| B-01 | P1 | Runtime/build | `backend/package.json:8-10`; no `backend/tsconfig.json` | Start expects `dist/server.js`; build is bare `tsc`; no tsconfig or tracked dist output exists. With no project config/input, tsc does not compile the source into that expected entry. | Deployment cannot rely on these scripts to produce/start the server. Static finding; build not run to avoid writes. | Define explicit TS build output and deployment build-before-start contract. |
| B-02 | P1 | Prisma tooling | `backend/prisma7.config.ts:6-13`, package scripts:11-12; schema:9-11 | Prisma 7 datasource URL is only in a non-default config filename; scripts omit `--config`; schema has no URL. | Generate/migrate may not load schema/URL. No Prisma command run. | Use discovered config name or pass explicit custom path. See [Prisma config reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference). |
| B-03 | P1 | Security | `api/sendemails.js:5-33) | Public handler accepts arbitrary recipient, has no auth/rate limit, reflects name in HTML and returns provider error details. | Email abuse/quota/reputation impact; email markup injection; provider detail leakage. Deployment exposure is unverified. | Restrict to verified signup flow, validate/rate-limit, escape HTML, return generic errors. |
| B-04 | P1 | Functional completeness | Entire `backend/src/` | Only health route exists; all intended product APIs/auth flows are absent. | Product clients cannot use this backend; no endpoint authorization can be assessed. | Implement only after API contracts and ownership rules are defined. |

P1 means likely blocker to stated production objectives. No P0: no active compromise/data loss/destructive operation was evidenced. Email severity depends on reachability.

## 4. Security Findings

### SEC-01 — P1 — Unauthenticated email sending
**Location:** `api/sendemails.js:5-17,24-33`. Handler checks method and truthy email, then sends to caller-selected recipient. No auth, signup proof, or rate limit is implemented. A reachable endpoint can be automated to spend SendGrid quota and damage sender reputation. Require verified signup/server identity, rate limits, field validation and abuse monitoring. Reachability not verified.

### SEC-02 — P2 — HTML injection in outbound mail
**Location:** `api/sendemails.js:20-21`. Untrusted `name` is inserted into HTML without escaping. Markup may render in email clients (email injection; not evidence of browser stored XSS). Escape contextually and limit length.

### SEC-03 — P2 — Provider error leakage
**Location:** `api/sendemails.js:27-33`. Response includes provider error and response body. Return generic error + correlation ID; log sanitized diagnostics.

### SEC-04 — P2 — Permissive CORS
**Location:** `backend/src/app.ts:11-12`. `cors()` default permits browser origins broadly. No credentialed API currently exists, so this is not itself auth bypass; it expands future exposure. Use deployment-specific allowlist.

### SEC-05 — P2 — No backend auth/RBAC
**Location:** Entire backend source; only route at `app.ts:21-26`. No token/password/OAuth/authorization middleware exists. This is absence, not a bypass of a protected route. Add deny-by-default auth and owner checks before resource routes.

### SEC-06 — P2 — Generic JSON size policy
**Location:** `backend/src/app.ts:14-15`. Uses parser defaults without an application-specific cap. Set a deliberately small body limit and validate field lengths before public API exposure.

### SEC-07 — P2 — Weak environment parsing
**Location:** `backend/src/config/env.ts:12-24`. DB vars are only checked non-empty; port coercion silently falls back on nonnumeric input and accepts negative/fractional values. Validate URLs and port range with typed startup errors.

### SEC-08 — P2 — SendGrid deployment secret unverifiable
**Location:** `api/sendemails.js:3`. Key comes from environment; no literal key found. Deployment configuration not inspected. Verify secret exists only in deployment secret store and fail safely without exposing it.

**Secrets/logging:** Local `backend/.env` is ignored and not tracked; contents were not read. Only blank database variables are in tracked example. No hardcoded database/JWT/OAuth/Cloudinary/Firebase/SendGrid secret found in inspected source. Morgan dev format does not explicitly log body/auth headers; email handler logs provider response details. Never log tokens or sensitive applicant data.

**Not assessable because code is absent:** SQL/NoSQL injection in handlers, password hashing, OAuth linking, JWT strength, refresh replay/rotation, CSRF/cookies, IDOR, resource ownership.

## 5. Performance Findings

No benchmarks/load tests run; findings are code-level risks, not measured.

### PERF-01 — P2 — Dual DB mandatory at startup
**Location:** `backend/src/server.ts:6-16`. Probes Postgres, then connects Mongo, then listens. Either failure blocks every route, including health. Cold starts and availability are coupled to both stores although no feature routes use either yet. Define readiness dependencies, bounded timeouts, and connect only required services.

### PERF-02 — P2 — No pagination/query contract
**Location:** No backend service/query layer. Feed/jobs/chat list endpoints do not exist. Unbounded first implementations would grow in reads and payload. Specify stable cursor order, maximum page size, projection, and batching before implementation.

### PERF-03 — P2 — Mongo index deployment unverified
**Location:** `backend/src/models/*.ts`. Helpful indexes are declared, but no index rollout or live catalog was reviewed. Missing deployed indexes could cause scans/duplicates. Verify actual indexes and explain plans.

### PERF-04 — P3 — Development request logger everywhere
**Location:** `backend/src/app.ts:17-18`. `morgan("dev")` is unstructured console logging in all environments; at load, adds IO/noisy logs. Use structured, redacted production logs.

**Scale risk projection (not benchmarks):**
- **100 users:** Core concern is absent feature API, email abuse, and both DBs gating startup.
- **1,000 users:** Unbounded list APIs would be the first likely DB/payload issue if implemented naively.
- **10,000 users:** Cross-store consistency, counter/last-message write contention, and index/query design become central.
- **100,000 users:** No pool sizing, rate limits, caching, queueing, metrics, or workload validation exists. No throughput estimate is supportable.

## 6. Database Findings

### PostgreSQL

**Good constraints:** unique user email; unique application `(job_id,student_id)`; unique follow pair; FKs; refresh token cascades on user deletion. Migration `20260925145748_fix_connections` prevents self-links and duplicate active unordered pairs via canonical expression unique index.

1. **P2 — Job FK does not enforce recruiter role** — `schema.prisma:122-143`. Any User may own a Job absent app logic.
2. **P2 — Refresh token hash lacks index/unique** — `schema.prisma:104-115`. Future lookup/revocation may scan; token service absent.
3. **P2 — Email case normalization undefined** — `schema.prisma:60-62`. Ordinary unique text equality permits differently cased logical duplicates unless app normalizes.
4. **P2 — Connection query indexes incomplete** — `schema.prisma:172-184`. Receiver indexed, requester not; sent-request queries may scan.
5. **P2 — Job browse composite index not defined** — `schema.prisma:122-143`. Status and recruiter indexes are separate; choose composite only after query plans.
6. **P2 — Soft deletion policy absent** — `schema.prisma:83-85`. deletedAt does not hide accounts or define email reuse.
7. **P2 — OAuth-only account mismatch** — `schema.prisma:59-64`. Required passwordHash; no provider identity relation. Provider login is not implemented.
8. **P3 — Restrictive deletes require lifecycle policy** — Job/application/connection/follow FKs restrict deletion. No service handles archival/deletion.
9. **P3 — Role index value unverified** — `schema.prisma:96`; not inherently wrong, validate against actual queries.

### Prisma

- Schema models relational user/auth-token/job/application/connection/follow only. Feed/chat data is outside Prisma; no cross-store application layer.
- SQL migration adds check/expression partial unique index not represented declaratively by Prisma model, creating drift risk.
- No transactions/services exist. Cross-store user deletion, counters, or chat summaries cannot be atomically committed across Postgres and Mongo.
- Custom config name is not default discovery; scripts omit custom path. Prisma docs specify default config discovery and custom `--config`.
- No migration state, generated client, live DB, plans, or constraints inspected.

### MongoDB

**Positive declarations:** chat pair unique and per-user list indexes; message `chat_id,created_at,_id`; post author/date and date indexes; partial unique likes per post/comment; comment post/parent/date indexes.

1. **P2 — Cross-store user refs not enforceable** — Post/Comment/Like/Message store user IDs as strings; no FK/cascade.
2. **P2 — Like invariant depends on Mongoose validation** — `Like.ts` pre-validate requires exactly one target; update operators may bypass document validation. No write service proves consistent validator use.
3. **P2 — Reply depth/parent-post checks are comments only** — `Comment.ts` says service enforces one level, but no service exists; schema does not prove parent belongs to same post.
4. **P2 — Chat last-message summary not implemented** — `Chat.ts`/`Message.ts` comments describe required update only. Concurrent writes could leave stale summary absent atomic ordering.
5. **P2 — Unique indexes not verified in Mongo** — declarations do not prove deployed indexes or clean existing data.
6. **P3 — Comment indexes overlap** — assess against actual filters/sort and explain plans.
7. **P3 — Denormalized counts lack update strategy** — post/comment counters have no atomic maintenance or reconciliation.
8. **P3 — Retention policy unspecified** — messages/tokens data lifecycle not defined.

No live database/index inspection was performed.

## 7. API Review

| Endpoint | Auth | Authorization | Validation | Errors | Performance | Issues |
|---|---|---|---|---|---|---|
| `GET /api/v1/health` (`app.ts:21-26`) | None | None | N/A | Always 200 | No DB check in handler | Liveness/readiness conflated; after startup DB outage can still show healthy. |
| `POST /api/sendemails` (`api/sendemails.js:5-33`) | None in handler | None | Truthy email only | Raw provider fields returned | Caller can trigger unbounded sends | Arbitrary-recipient relay, HTML interpolation, error leak; deployment exposure unverified. |

Auth, users, jobs, applications, feed/posts/likes/comments, connections, and chat endpoints are absent. Their status codes, validation, pagination, and ACL cannot be assessed.

## 8. Feature-by-Feature Review

### Authentication
Not implemented: local register/login, password verify/hash, JWT, refresh rotation/revocation, logout, OAuth callbacks, account linking, or identity mapping. RefreshToken schema is not an implementation. Required passwordHash conflicts with provider-only accounts unless a credential model/policy is defined.

### Users
Only Prisma schema. No profile CRUD/visibility. deletedAt has no automatic filtering; email reuse after deletion is undefined.

### Feed / Posts
No feed route/query/service. Mongo Post schema requires author/content, max content 3000, declares author/date and global-date indexes. No auth-derived author, owner checks, pagination, URL validation, or counter maintenance.

### Likes
Partial unique indexes intended to prevent duplicate post/comment likes; exactly-one target is Mongoose pre-validation only. No endpoint/service or counter updates.

### Comments
Content max 1500, optional parent, query indexes. One-level and same-post parent rules are not enforced by an existing service. No ownership/edit/delete/counter behavior.

### Connections
FKs plus migration-level no-self and active-pair uniqueness are solid DB protections. No endpoint enforces requester/receiver roles or state transitions. Rejected/removed history may repeat by design.

### Jobs
Prisma enums/fields and recruiter/status indexes exist. No endpoint, role/owner checks, search, pagination, deadline enforcement, or state transitions. FK only checks that a user exists.

### Applications
DB unique pair safely blocks duplicate applications, including concurrent insert attempts. No service checks role, job open/deadline, CV, privacy, recruiter ownership, or status transition. Deletes are restrictive.

### Chat
Chat hook sorts IDs and rejects self-chat; pair unique index. Messages have deterministic sort index. No participant/sender ACL, pagination, read updates, or atomic chat summary. IDs have no cross-store FK.

### External Services
Postgres adapter and Mongo connection are startup-only; SendGrid function lacks abuse controls. No backend Firebase/Cloudinary/OAuth integration found. Flutter integrations are outside this backend review.

## 9. Testing Gaps

No backend test files/framework/fixtures/test DB/CI backend test setup found. `api/package.json` test command exits 1.

Prioritized tests:
1. **P1:** auth/OAuth linking/password/token expiry, rotation, replay, revoke/logout.
2. **P1:** endpoint role/ownership/IDOR matrix and email relay abuse/sanitization.
3. **P2:** DB uniqueness and concurrency (applications, follows, reverse active connections).
4. **P2:** Mongo likes invariant across update paths, comment parent/depth, chat membership and summary ordering.
5. **P2:** cursor ordering/page limits, readiness under DB outage, malformed/oversized input and safe errors.
6. **P3:** explain/load regression, pool saturation and index deployment checks.

## 10. Recommended Implementation Plan

Recommendations only; no changes were made.

### Phase 1 — Critical Security
- Restrict `api/sendemails.js`: verified caller, rate limits, validation, HTML escaping, generic errors. Depends on registration verification; risk: signup UX. Verify unauthorized/repeat/malformed/provider-failure tests.
- Harden `backend/src/app.ts`: allowlisted CORS, explicit JSON cap, production-safe logging. Depends on frontend origins; risk: legitimate client blocked. Verify preflight/body/log redaction.

### Phase 2 — Data Integrity
- Define cross-store ownership/deletion and failure compensation in future services and DB design. Verify failure injection and referential lifecycle.
- Align constraints/indexes in `schema.prisma`, migrations, Mongo models after query design: normalize email, token hash lookup, recruiter invariant, connection query indexes, live Mongo indexes. Review migrations and catalog; existing duplicates can block unique indexes.

### Phase 3 — Authentication & Authorization
- Add local/OAuth identity model and secure password/token lifecycle in future auth routes/services and owner-controlled schema changes. Decide providers, email verification, account linking, token storage. Test provider collisions, replay, revoke/logout.
- Add deny-by-default role/owner checks to every future feature route; derive user ID only from verified token. Test cross-role/cross-user matrix.

### Phase 4 — API Correctness
- Define contracts and implement validators/error middleware in `app.ts` and future routes. Standardize response/status/errors; test validation, conflict, auth, forbidden, not-found and generic 500.
- Split liveness/readiness in app/server, bounded dependency health, safe response. Test DB outages/startup.

### Phase 5 — Performance
- Add bounded cursor pagination to future feed/jobs/applications/chat query services and index actual sort filters. Verify cursor properties, explain plans, load tests.
- Configure connection bounds/timeouts and graceful shutdown in DB configs/server; avoid mandatory unused DBs. Verify SIGTERM and pool metrics.

### Phase 6 — Testing
- Add auth/security API integration suite and persistence/concurrency tests in a new backend test setup; use isolated databases/mocks. Keep production credentials out of tests.

### Phase 7 — Cleanup / Architecture
- Repair build/config: `backend/package.json`, add TS config, resolve Prisma config filename/path. Build in disposable checkout; validate entry output; run non-mutating validation only after owner approval. ESM import/output mismatch is a regression risk.
- Decide whether both Mongoose and Prisma are needed; remove dependencies only after owner approval/source review. Document data ownership and deploy/env setup in currently empty `backend/README.md`.

## 11. SOP

This is a handoff sequence, not permission to modify the locked backend.

### SOP-01 — Route/ownership contract
- **Priority:** P1 | **Files:** future API docs/routes.
- **Objective:** Inventory every route, role, resource scope, validation, response and pagination.
- **Guidance:** Define actor from verified identity; specify owner predicates and state transitions before coding.
- **Dependencies:** Product/API decisions.
- **Verification:** Route inventory checked against all handlers; ACL matrix tests.
- **Regression risk:** Missing role/workflow cases.

### SOP-02 — Email abuse controls
- **Priority:** P1 | **Files:** `api/sendemails.js`, deployment env.
- **Objective:** Only verified registration may trigger bounded welcome email.
- **Guidance:** Authenticate server event, validate/limit fields, rate-limit, escape HTML, generic errors and sanitized logs.
- **Dependencies:** Signup verification.
- **Verification:** Unauthorized, abuse, injection, malformed and provider outage tests.
- **Regression risk:** Existing signup email may fail until identity handoff is defined.

### SOP-03 — Auth/provider identity
- **Priority:** P1 | **Files:** future auth routes/services; schema/migrations under owner control.
- **Objective:** Support local/Google/GitHub safely.
- **Guidance:** Unique provider subject; verified-email linking; optional local credential; secure hash; expiring access token; hashed rotating refresh tokens and reuse revocation.
- **Dependencies:** Provider setup and product token policy.
- **Verification:** Collision/linking/takeover/replay/logout integration tests.
- **Regression risk:** Duplicate accounts or unsafe forced linking.

### SOP-04 — RBAC/ownership
- **Priority:** P1 | **Files:** future middleware/routes/services.
- **Objective:** Prevent horizontal/vertical privilege escalation.
- **Guidance:** Deny by default; scope mutations by actor and resource owner; never trust body actor IDs.
- **Dependencies:** SOP-01/03.
- **Verification:** Student/recruiter/other-user matrix for every endpoint.
- **Regression risk:** Legitimate flows denied by wrong ownership model.

### SOP-05 — Validation/errors
- **Priority:** P2 | **Files:** `app.ts`, future validators/error middleware, `config/env.ts`.
- **Objective:** Reject invalid/large data before DB use; standardize safe errors.
- **Guidance:** Explicit size caps, validate params/query/body/URLs, typed error map, validate URLs/port/env.
- **Dependencies:** API contract.
- **Verification:** Boundary and malformed-input tests; assert no stack/provider detail.
- **Regression risk:** Existing client payloads rejected.

### SOP-06 — DB invariants/indexes
- **Priority:** P2 | **Files:** Prisma schema/migrations and Mongo schemas/index deployment.
- **Objective:** Match database rules to ownership, concurrency and query patterns.
- **Guidance:** Preserve app/follow/pair uniqueness; decide normalized email, token index, role invariant; verify Mongo unique indexes; validate all write paths.
- **Dependencies:** SOP-01/query plans and data inventory.
- **Verification:** Migration review, catalog, explain plans and concurrent writes. Production migration requires separate owner approval.
- **Regression risk:** Existing duplicates and SQL-only constraint drift.

### SOP-07 — Feed/social/chat consistency
- **Priority:** P2 | **Files:** future Mongo services/routes/models.
- **Objective:** Implement bounded queries and consistent counters/chat summaries.
- **Guidance:** Stable indexed cursor, batch authors, enforce ownership/participants, atomic counters and ordered summary update.
- **Dependencies:** Data consistency decision and SOP-04.
- **Verification:** Cursor, duplicate-like, parent-comment, concurrent-message, failure tests.
- **Regression risk:** Counter drift or feed-order changes.

### SOP-08 — Health/lifecycle
- **Priority:** P2 | **Files:** `app.ts`, `server.ts`, DB config.
- **Objective:** Separate liveness/readiness and close clients gracefully.
- **Guidance:** Liveness independent of DB; bounded readiness for required stores; graceful SIGTERM; connection helpers return errors to lifecycle owner.
- **Dependencies:** Host health policy.
- **Verification:** Start failure, post-start DB loss, SIGTERM tests.
- **Regression risk:** Bad readiness triggers restart loops.

### SOP-09 — Build/Prisma config
- **Priority:** P1 | **Files:** `backend/package.json`, TypeScript config, Prisma config path.
- **Objective:** Build emits the expected `dist/server.js`; Prisma scripts load the datasource.
- **Guidance:** Explicit target/module/root/out/include/strictness; align custom config path; never put migrations in build.
- **Dependencies:** Node/deploy runtime.
- **Verification:** Clean disposable build; check entry artifact; non-mutating config validation with explicit path.
- **Regression risk:** ESM import paths or Node runtime mismatch.

### SOP-10 — CI/observability
- **Priority:** P2 | **Files:** test config, CI, logging/metrics setup.
- **Objective:** Catch regression and production failures without sensitive logs.
- **Guidance:** Run unit/integration/security tests, structured request IDs, latency/pool metrics and actionable alerts.
- **Dependencies:** Implemented routes and isolated test environment.
- **Verification:** CI reports, redaction review, staged load tests.
- **Regression risk:** Flaky tests/noisy alerts.

## Review Limits and Git State

- Branch: `feature/feed`, tracking `origin/feature/feed`; working tree clean; no staged/unstaged changes.
- Recent commits: `cab46433` feed/backend TS; `8c8d5916` backend TypeScript migration; `49a708f8` DB setup; `fc73cb3c` and `98a20c0f` stop tracking env files.
- No tracked `backend/.env`; it is ignored. Blank example only. No suspicious generated backend source identified.
- Dependency versions read from manifest/lockfile. No network CVE audit or current outdated claim.
- No tests/typecheck/build/Prisma command/migration/DB connection/API call was run.
- Live Vercel reachability/secrets, DB state/indexes, production logs are unverified.
- **No source modified; no migration; no dependency operation; no commit.**

## Final Summary

- **P0:** 0
- **P1:** 4
- **P2/P3:** Additional findings detailed above; plan tasks are not all separate counted findings.
- **Most critical areas:** absent auth/API, public email sender, build/start configuration, Prisma config discovery.
- **Source modification:** none.
- **Review document:** `BACKEND_FULL_REVIEW.md`
