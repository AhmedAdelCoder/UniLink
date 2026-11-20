# UniLink Feed Backend — Final Production Readiness Audit

**Audit date:** 2026-11-03  
**Review type:** Read-only static audit of current workspace sources and reports. No source, config, dependency, branch, or database changes were made. Tests/build were not executed; no database was contacted.

## Executive summary

**Overall verdict: NOT READY.** The route layer applies JWT authentication and Zod validation, ownership checks constrain post updates/deletes, feed pagination is keyset-based and bounded, and author/like lookups are batched. Those are useful controls. However, persisted counters can diverge from likes/comments on standalone/error paths; deletion cleanup is non-atomic, may report success despite failure, and has no scheduled recovery caller; comment replies are unbounded per page; and the active client/feed contract is not shown to use this backend. The available tests use an in-memory mock and direct controller calls, so they do not verify real MongoDB transaction behavior or HTTP middleware.

No evidence establishes capacity for a particular user count or production query-plan/index state. Mongo deployment topology, deployed indexes, real data shape, and real database behavior remain unverified.

## Overall readiness verdict

**NOT READY — do not treat this audit as evidence that Chat can safely rely on Feed persistence invariants.** Before integration, decide the supported Mongo topology and make mutation/counter/deletion guarantees valid for it; provide reliable cleanup recovery; and run isolated real-Mongo integration tests. If Chat will not consume Feed writes or counters, some integration risk is reduced, but the Feed module itself is still not production-ready based on current evidence.

| Dimension | Verdict | Evidence |
|---|---|---|
| Performance | NOT READY | Reply query has no limit/projection (`backend/src/modules/feed/feed.service.ts:783-789`); full post documents are loaded for bounded feed pages (`:77-83`); deployed plans are unknown. |
| Security | READY WITH ISSUES | JWT verification and global route authentication are present (`backend/src/utils/jwt.ts:34-53`, `backend/src/modules/feed/feed.route.ts:31`); no dedicated Feed rate limiter, arbitrary URL schemes/length, and no active-user recheck (`feed.route.ts:31-88`, `feed.validation.ts:15-35`, `authmiddleware.ts:27-41`). |
| Data Integrity | NOT READY | Unlike deletes the source like before decrementing and has no standalone compensation (`feed.service.ts:319-354`); comment-unlike same pattern (`:629-743`, inspect exact current implementation); cleanup races and best-effort compensations exist. |
| Reliability | NOT READY | Cleanup is caught and request returns deleted success; retry helper is not wired into startup/scheduler (`feed.service.ts:419-437,480-498`, `server.ts:86-105`). |
| API Design | READY WITH ISSUES | Routes are validated/authenticated; global newest-first backend feed and response contract differ from the client’s Firestore-backed feed described in `backend/docs/feed/FEED_BACKEND_DEEP_AUDIT.md`. Confirmed backend route behavior is summarized below. |
| Testing | NOT READY | Service tests use `MockDatabaseFixture`; API tests invoke controller functions with fake request/response; no real Mongo or HTTP stack (`backend/test/fixtures/mockDb.ts`, `backend/test/feed.api.test.ts`). |
| Code Quality | READY WITH ISSUES | Responsibilities are concentrated in a large service, broad transaction fallback can rerun work, `any` usage and unchecked request assertions require inspection/discipline; errors and cleanup logs exist. |
| Production Readiness | NOT READY | Core correctness/recovery/integration evidence is insufficient; production index presence and database topology are unverified. |

## Prioritized findings

### F-01 — Unlike failure can permanently desynchronize like records and counters

**Severity: HIGH · Blocks Chat integration: YES if Chat relies on Feed like state/counts.**  
**Location:** `backend/src/modules/feed/feed.service.ts:319-354` (post unlike) and `:696-743` (comment unlike).

The operation deletes the Like document, then separately updates the counter. In standalone mode `runInTransaction` passes `null` and there is no compensation if the counter operation errors or finds no target. A transient DB error after the delete leaves the like gone while the count remains high. A crash between writes has the same outcome. The `$max` decrement avoids negatives but does not ensure equality between the counter and source records.

**Fix:** Require transaction-capable Mongo for multi-document invariants, or redesign around durable idempotent reconciliation/outbox semantics. Add failure-injection tests against actual standalone and replica-set instances.

### F-02 — Cleanup can fail while API reports deletion success; recovery is not scheduled

**Severity: HIGH · Blocks Chat integration: YES until eventual cleanup/recovery contract is operational.**  
**Location:** `backend/src/modules/feed/feed.service.ts:419-437,440-498`; server startup has no recovery invocation (`backend/src/server.ts:86-105`).

`deletePost` tombstones the post, catches cleanup errors and returns `{deleted:true}`. The helper `retryOrphanedPostCleanups` is exported, but no in-repository runtime caller or cron/scheduler was found. Therefore a process crash or persistent cleanup failure can leave orphaned likes/comments indefinitely. The log calls cleanup “Background” although it is awaited synchronously. Retry count can overstate completed work because it increments whenever cleanup resolves, even if `postDeleted` is false (`:428-437`).

**Scenario/impact:** Database failure during child cleanup yields a successful DELETE response and an indefinitely retained tombstone/child rows; operators receive logs but no durable retry guarantee.

**Fix:** Wire a durable scheduled worker with claim/lease and bounded retries, expose cleanup age/failure metrics, and define API behavior when cleanup is pending. Make completion metrics reflect actual completion.

### F-03 — Child comment likes can race with post deletion and create orphans

**Severity: HIGH · Blocks Chat integration: YES if shared persistence/cleanup assumptions apply.**  
**Location:** `backend/src/modules/feed/feed.service.ts` comment-like mutation around `:629-743`; cleanup deletes likes/comments and then post at `:378-415`; tombstone at `:460-474`.

`likeComment` checks the comment exists but does not require its parent post to remain active. Cleanup can delete comment likes and comments while an in-flight like inserts a new Like. Depending on ordering, cleanup may then remove the comment and leave a like referencing no comment. The cleanup workflow is not coordinated with these mutations, even when individual mutations use a Mongo transaction.

**Fix:** Make child mutations verify and serialize against active parent state; coordinate cleanup with mutations (transaction/claim/lock or a durable tombstone protocol) and add real race tests.

### F-04 — Replies make comment page size unbounded

**Severity: HIGH · Blocks Chat integration: YES for production use of comments at scale.**  
**Location:** `backend/src/modules/feed/feed.service.ts:762-803`.

Top-level comments are limited to `limit + 1`, but the next query retrieves every reply for those top-level IDs without `.limit()` or a projection (`:783-789`). One popular thread can therefore produce arbitrarily large DB result sets, author/like ID lists, memory use, serialized responses, and network payload despite the top-level page cap of 50.

**Fix:** Bound reply previews and add separately paginated replies, or another explicit capped response contract. Return only required fields and document client compatibility implications.

### F-05 — Transaction fallback can silently downgrade and rerun a unit of work

**Severity: HIGH · Blocks Chat integration: YES until deployment consistency mode is explicit.**  
**Location:** `backend/src/utils/transaction.ts:8-32,48-80`.

Topology is read through a type assertion to driver internals; unknown/not-ready topology selects nontransactional execution (`:9-24,48-55`). On error code 20 or broad message matches after `withTransaction`, the callback is run again without a session (`:65-80`). A generic callback rerun after an ambiguous transaction failure can duplicate effects; current Feed callbacks mostly write Mongo only, but the fallback is not a safe generic contract. A standalone deployment also silently operates with weaker guarantees than replica-set mode.

**Fix:** Select transaction mode explicitly from supported deployment configuration/capability checks, emit startup diagnostics, fail startup or mutation when required guarantees are unavailable, and do not rerun a callback after an ambiguous transaction result.

### F-06 — Standalone compensation is best-effort and silently suppresses rollback failure

**Severity: HIGH · Blocks Chat integration: YES if standalone is supported.**  
**Location:** `backend/src/modules/feed/feed.service.ts:279-304,585-608`; transaction fallback at `backend/src/utils/transaction.ts:48-55`.

Like and comment creation attempt to delete the first write if the later counter write fails, but `.catch(() => {})` hides failed compensation. A process crash or failed compensating delete leaves persisted records and stale counters. This is not atomicity or durable eventual consistency; no reconciliation job was found.

**Fix:** Prefer required Mongo transactions. Otherwise record compensation intent durably and reconcile with metrics/alerts; surface compensation failures.

### F-07 — Legacy posts without `deleted_at` cannot be deleted

**Severity: MEDIUM · Blocks Chat integration: NO, but blocks reliable legacy post deletion.**  
**Location:** `backend/src/modules/feed/feed.service.ts:445-450,462-474`.

The feed query correctly treats `deleted_at: null` as matching absent fields in MongoDB, but the delete precheck requires `post.deleted_at === null`. For a legacy document with the field missing, the lean value is `undefined`, so `undefined !== null` is true and delete returns 404. The update filter also matches explicit null, not missing.

**Fix:** Treat absent and null as active consistently, and add a legacy-shape test or migration.

### F-08 — Feed writes have no rate limiting

**Severity: MEDIUM · Blocks Chat integration: NO; should be fixed before public production exposure.**  
**Location:** `backend/src/modules/feed/feed.route.ts:31-88`; only `authLimiter` is declared in `backend/src/middlewares/rateLimiter.ts:1-7` and is not applied here.

An authenticated account can repeatedly create posts/comments or send like operations. Payload constraints bound individual values but not request frequency. This enables database/resource exhaustion and moderation spam.

**Fix:** Apply endpoint-specific read/write limits using a distributed store when running multiple instances; monitor legitimate rates when selecting thresholds.

### F-09 — `image_url` accepts arbitrary URL schemes and no explicit maximum

**Severity: MEDIUM · Blocks Chat integration: NO, unless clients render untrusted schemes unsafely.**  
**Location:** `backend/src/modules/feed/feed.validation.ts:15-35`; stored as string in `backend/src/modules/feed/models/Post.ts:14-21`.

`z.url()` validates URL syntax but does not express a product-specific HTTPS/host allowlist or length cap. The backend does not fetch the URL, so this audit did not establish SSRF. A client may render a dangerous or unsupported scheme, while very long values inflate storage and responses.

**Fix:** Allow only intended schemes (normally HTTPS), set a practical maximum length, and restrict hosts if uploads are expected to use a known provider.

### F-10 — Deleted/deactivated users remain authenticated until token expiry

**Severity: LOW / policy-dependent · Blocks Chat integration: NO unless immediate revocation is required.**  
**Location:** `backend/src/middlewares/authmiddleware.ts:27-41`; token verification `backend/src/utils/jwt.ts:34-53`.

JWT signature, HS256 algorithm, expiry, user ID type, and role are checked. Feed requests do not re-query user existence or active/deleted state. A valid token for a removed account therefore remains usable until expiry. Whether this violates policy is unverified.

**Fix:** Define account lifecycle semantics; if immediate revocation is required, use active-user checks or token version/revocation strategy.

### F-11 — Production index existence and query plans are unverified

**Severity: MEDIUM · Blocks performance sign-off, not local API integration.**  
**Location:** Index declarations: `backend/src/modules/feed/models/Post.ts:33-35`, `Like.ts:47-85`, `Comment.ts:47-57`; connection `backend/src/config/mongodb.ts:4-8`.

Schema declarations include a feed sort/cursor compound index and unique partial like indexes. Feed reads are bounded keyset pages, author and viewer-like lookups are batched, and author SQL fields are selected narrowly. However, no deployed `getIndexes()` evidence or `explain()` output was examined. Mongoose connection code has no explicit index deployment verification. Thus index presence, unique-index enforcement in production, and actual query efficiency are unknown.

**Fix:** Verify deployed indexes and uniqueness in a controlled preflight; capture query plans for actual feed/comment/cleanup patterns. Do not claim measured scalability without load testing.

### F-12 — Cursor and body/request limits are not fully explicit

**Severity: LOW · Blocks Chat integration: NO.**  
**Location:** Cursor parsing `backend/src/modules/feed/feed.service.ts:27-45`; query schema `backend/src/modules/feed/feed.validation.ts:7-12,51-54`; JSON parser `backend/src/app.ts:17-18`.

The page limit is appropriately constrained to 1–50 and cursor contents are validated, but there is no explicit cursor string length cap. Express JSON parsing relies on its default body-size limit. These are minor hardening/contract gaps; no practical exploit was demonstrated.

**Fix:** Cap cursor size and set/document an explicit JSON body limit.

## Performance assessment

- **Feed page efficiency:** Mongo page is bounded to `limit + 1` and uses stable `(created_at, _id)` keyset ordering (`feed.service.ts:56-83`). It batches author IDs and viewer likes rather than issuing per-post lookups (`:91-119`). No N+1 on this path was found. It loads full post documents without projection (`:77-83`); this is avoidable data transfer if schema grows.
- **Comment page:** Top-level comments are keyset-paginated, but replies are not bounded; this is the highest confirmed response-size risk (`feed.service.ts:762-803`). Authors and likes for all returned comments are batched (`:806-824`).
- **Indexes:** Declarations align partially with patterns; actual plans and deployed index state are unverified. Cleanup uses direct post/comment like indexes; comment batching is bounded at default 500 (`:381-405`). `batchSize` itself is not validated: zero means Mongo `.limit(0)` (no result limit), which can defeat bounds and potentially keep a non-progressing loop if comments remain (`:364-387`). **Finding F-13, MEDIUM:** validate `batchSize` as a positive bounded integer and assert batch progress.
- **Concurrency:** No load or contention testing was run. Thousands-user capacity cannot be concluded from source inspection.
- **Cleanup:** Sequential per-post retry loop is bounded by `limit` but processes tombstones one at a time and has no lease (`:420-437`). Runtime cleanup is synchronous on delete request (`:480-493`).

## Security assessment

- All Feed routes inherit `authMiddleware()` (`feed.route.ts:31`). JWT verification restricts algorithm to HS256 and checks expiry and payload shape (`jwt.ts:34-53`). No auth bypass was identified in the registered route path.
- Post update and delete check ownership, and database update filters include authenticated owner (`feed.service.ts:196-219,445-474`). Client fields are schema-whitelisted; counters and `author_id` are not accepted by update validation (`feed.validation.ts:15-35`). No mass assignment or NoSQL operator injection was found in inspected Feed handlers.
- Mongo IDs are validated and pagination limits are bounded (`feed.validation.ts:4-12,40-60`). Prisma calls use structured ORM queries; no raw SQL was found in Feed.
- `helmet()` is enabled, but `cors()` allows all origins (`backend/src/app.ts:11-18`). With bearer-token auth, wildcard CORS is not itself an authentication bypass; production browser origins should be constrained. Socket.IO also has wildcard CORS in `backend/src/server.ts:14-19`, which is adjacent server configuration.
- Error middleware hides unexpected details from clients (`backend/src/middlewares/errorMiddleware.ts:42-45`, as described/verified in source); cleanup logs include error/stack (`feed.service.ts:483-492`). Request logging uses Morgan dev mode (`app.ts:20-21`), which should be reviewed for production logging policy.
- No upload or server-side URL fetch is implemented in Feed; URL concern is client rendering and storage, not established SSRF.

## Data integrity and reliability assessment

- Like uniqueness is represented by partial unique index declarations (`Like.ts:47-66`); enforcement in the deployed DB remains unverified.
- Like/comment counters are denormalized. Create operations use transactions where supported and best-effort rollback on standalone; unlike does not compensate. Counter equality is therefore not guaranteed across all supported modes/failures.
- Post tombstoning hides the post from normal feed reads, and cleanup deletes post likes then comment likes/comments in batches before hard-deleting the post (`feed.service.ts:378-415`). No transaction covers cleanup; in-flight child mutation can race it. Failure leaves a tombstone, but no automatic worker is wired.
- Parent reply validation enforces same post and one-level nesting (`feed.service.ts:534-553`), but application checks alone do not provide synchronization against deletion.
- Cross-store user references are strings from PostgreSQL in Mongo documents; no FK can enforce user lifetime. Missing author mapping returns null in feed responses (`feed.service.ts:121-142`). Orphan user-content policy is unverified.
- No counter reconciliation, orphan-record audit job, or scheduled cleanup was found.

## API findings and endpoint inventory

All Feed routes are mounted at `/api/v1/feed` (`backend/src/app.ts:31-33`) and require JWT auth (`feed.route.ts:31`). Validation is attached per route (`feed.route.ts:33-88`). The controller layer uses consistent success envelopes; error mappings should be confirmed through route-level tests.

| Method and path | Behavior | Notes |
|---|---|---|
| `GET /api/v1/feed` | Global newest-first feed, limit 1–50 (default 20), opaque base64url cursor | Keyset; page bounded; unlike Flutter/Firestore behavior may be a contract mismatch. |
| `POST /api/v1/feed` | Create post, 201 | Author resolved from PostgreSQL; content 1–3000; tags max 10. |
| `PATCH /api/v1/feed/:postId` | Owner update, 200 | Only content/image/tags. |
| `DELETE /api/v1/feed/:postId` | Tombstone and attempt cleanup, 200 | Success does not imply cleanup completed. |
| `POST /api/v1/feed/:postId/like` | Like, 201 | Duplicate intended 409 if unique index exists. |
| `DELETE /api/v1/feed/:postId/like` | Unlike, 200 | Missing like returns 404; not idempotent. |
| `POST /api/v1/feed/:postId/comments` | Create root/reply comment, 201 | One reply level. |
| `GET /api/v1/feed/:postId/comments` | Paginated top-level comments with inline replies | Inline replies unbounded. |
| `POST /api/v1/feed/comments/:commentId/like` | Like comment | Parent post active state is not checked. |
| `DELETE /api/v1/feed/comments/:commentId/like` | Unlike comment | Same standalone delete/decrement risk. |

## Testing assessment

- **Unit/service tests:** `backend/test/feed.service.test.ts` imports service code but replaces Mongoose/Prisma operations with `MockDatabaseFixture` (`backend/test/fixtures/mockDb.ts`). It checks business-path behavior in a JavaScript Map fixture.
- **API/controller tests:** `backend/test/feed.api.test.ts` directly calls controllers with fake request/response; it does not start Express or execute route auth, Zod middleware, HTTP parsing/serialization, or error middleware.
- **Database/integration tests:** None found. No actual MongoDB instance, transaction/session propagation, unique-index behavior, query plan, or standalone behavior is verified by these tests.
- **Concurrency tests:** Some `Promise.all` cases exercise the mock fixture. They do not model Mongo locking, write conflicts, transaction retries, or ambiguous acknowledgements.
- **Security tests:** Source has positive validation/ownership controls, but no dedicated HTTP auth/IDOR/abuse security suite was found.
- Supplied Phase 1 report claims 24 tests passed. That result was not rerun. Source inspection shows 19 `it(...)` cases in service tests and 5 in API tests (counts are consistent with 24 total), but the tests remain mock-based.

## Code quality and maintainability

The service combines pagination, cross-store author lookup, post operations, comments, likes, cursor helpers, and cleanup in one module. This is maintainable at current size only if invariants are clearly tested. Transaction behavior has unsafe generic fallback semantics and uses private driver topology internals. Most errors propagate through `AppError`/middleware; compensation failures are swallowed. `cleanupPostResources` accepts an unchecked batch size. No real test/build/typecheck was run, so TypeScript correctness in the installed compiler configuration is unverified.

## Prioritized fix list

### Must fix before production Chat integration

1. Define and enforce Mongo transaction deployment mode; remove callback rerun on ambiguous transaction failures.
2. Make like/unlike/comment counter changes atomic or durably reconcilable, including unlike failures and compensation failures.
3. Prevent child mutation/deletion races and guarantee eventual cleanup with scheduled durable worker and observable retry state.
4. Bound replies per comment page and define the client response/pagination contract.
5. Add real MongoDB replica-set and standalone integration suites (if both modes remain supported), failure injection, race scenarios, and route-level HTTP tests.

### Should fix before broad public release

6. Validate cleanup batch size and add progress safeguards.
7. Handle missing `deleted_at` consistently for legacy posts.
8. Add Feed-specific rate limiting; constrain URL scheme/length and configure CORS origins.
9. Verify production indexes and representative `explain()` plans; perform load tests before making scale claims.

### Can be deferred with explicit tracking

10. Add active-user/token revocation checks if immediate account removal is a product requirement.
11. Add explicit JSON body and cursor-size limits; consider projection in feed page after measuring.
12. Split the service module only where it clarifies ownership/invariants; avoid structural refactor without corresponding tests.

## Issues that can be deferred

The lower-risk hardening items (explicit body/cursor caps, production CORS allowlist where no browser client exists, service file decomposition, and profile lookup caching) can be scheduled after the consistency, cleanup, pagination, and integration-test gaps are closed. Rate limiting and URL scheme restrictions should precede public exposure.

## Evidence and limits

Primary inspected files include `backend/src/modules/feed/feed.service.ts`, `feed.route.ts`, `feed.controller.ts`, `feed.validation.ts`, all three Feed models, `backend/src/utils/transaction.ts`, `backend/src/config/mongodb.ts`, `backend/src/app.ts`, auth/JWT/error middleware, `backend/src/server.ts`, `backend/test/feed.service.test.ts`, `backend/test/feed.api.test.ts`, and `backend/test/fixtures/mockDb.ts`. Reviewed the supplied root phase implementation and verification reports plus `backend/docs/feed/FEED_PHASE_1_IMPLEMENTATION_REPORT.md` and `backend/docs/feed/FEED_BACKEND_DEEP_AUDIT.md`; their claims were treated as claims and checked against current sources. The existing deep audit contains stale observations (for example, it describes cleanup loading all comment IDs; current code batches 500 IDs), so current source takes precedence.

Unverified: deployed Mongo topology and indexes, data quality/legacy record frequency, PostgreSQL/Mongo availability and behavior, actual query plans, production environment values, HTTP behavior through a live Express server, test pass status, load capacity, and Flutter-to-backend production routing. No tests were run because the audit could be completed from source and the request required a read-only audit; no database was contacted.

## Final question

**Can we confidently stop working on the Feed module and proceed with Chat development without risking major performance, security, or data-integrity problems?**

**NO.** Current source shows standalone mutation paths where records and counters can diverge, deletion cleanup without scheduled recovery, an unbounded replies query, and no real Mongo/HTTP integration evidence. The index and deployment topology required to substantiate production guarantees are also unknown. Resolve the blocking items above and verify them against disposable real MongoDB deployments before relying on Feed as a production integration dependency.
