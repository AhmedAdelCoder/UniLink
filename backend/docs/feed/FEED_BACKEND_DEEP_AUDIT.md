# UniLink Feed Backend Deep Audit

**Scope:** Express backend Feed module, MongoDB persistence, PostgreSQL user lookups, shared HTTP middleware, related Flutter feed data source, and available tests.  
**Review type:** Read-only static audit. No source, schema, configuration, or test files were changed; no database-backed tests were run.  
**Date:** 2026-11-03

## A. Executive summary

The backend Feed implementation has several solid controls: all registered Feed routes inherit JWT authentication, request bodies and query/path inputs are Zod validated, post ownership is checked in the service, the post content limit is enforced in both validation and the Mongo schema, user lookups explicitly select public fields, and the feed uses bounded keyset pagination with a matching compound index.

The main production concerns are consistency across collections and the disconnected client contract. Like/comment counts are updated in separate database operations from the source like/comment records; failures and races can leave cached counters wrong. Post deletion is also split from cleanup and silently succeeds when cleanup fails. The active Flutter datasource is Firestore-backed, uses Firebase Auth IDs, and applies connected-user filtering; the Express endpoint uses JWT/SQL users and intentionally returns a global feed. These are materially different contracts and the repository does not show the Flutter client calling `/api/v1/feed`.

No confirmed unauthenticated backend Feed operation, cross-owner post update/delete, SQL injection, NoSQL operator injection, or backend mass assignment was found in the inspected request path. No backend test suite was present under `backend`; existing feed tests exercise Flutter repository behavior with a fake datasource, not this API or its persistence.

## B. Security findings

### S-01 — Feed write operations have no dedicated abuse throttling

- **Severity:** Medium (abuse-control gap; not an authorization bypass)
- **Location:** `backend/src/modules/feed/feed.route.ts:31-60,64-88`; existing limiter is `backend/src/middlewares/rateLimiter.ts:3-7` and is applied to auth routes, not Feed routes.
- **Description:** Feed route middleware authenticates all endpoints but does not rate-limit post creation, comments, likes, or reads. An authenticated account can submit repeated valid writes. Content size is bounded by schema and default Express JSON parsing, which limits individual requests but not request frequency.
- **Scenario / impact:** A compromised or abusive account sends many create/comment/like requests, increasing database writes and degrading availability or creating moderation workload.
- **Recommendation:** Add route-specific limits informed by expected usage, using a shared/distributed limiter if multiple server instances are deployed. Monitor legitimate traffic before selecting thresholds. Keep read and write policies separate.

### S-02 — User deactivation and token revocation are not rechecked on Feed requests

- **Severity:** Low / informational pending account lifecycle requirements
- **Location:** `backend/src/middlewares/authmiddleware.ts:27-40`; JWT validation in `backend/src/utils/jwt.ts:34-53`; user model has `deletedAt` at `backend/prisma/schema.prisma:64-92`.
- **Description:** The middleware validates signature, expiry, algorithm, userId type, and role from the JWT, but does not confirm that the user still exists or is active. A still-valid token therefore continues to authenticate after user deletion/deactivation unless another mechanism revokes it. The inspected schema has soft-delete data, but no Feed requirement specifies how it should affect access.
- **Scenario / impact:** A removed or disabled account with an unexpired access token can continue using Feed operations until token expiry.
- **Recommendation:** Decide and document the account lifecycle contract. If immediate revocation is required, enforce active-user checks or a revocation/version strategy; account for the per-request database cost and token TTL.

### S-03 — URL validation accepts unbounded remote image URLs

- **Severity:** Low
- **Location:** `backend/src/modules/feed/feed.validation.ts:15-19,23-35`; persisted as a string in `backend/src/modules/feed/models/Post.ts:14-21`.
- **Description:** `image_url` is checked as a URL, but there is no explicit scheme allowlist or maximum length. The backend does not fetch the URL, so this is not a server-side request forgery finding. It does allow arbitrary URL schemes/very long strings to be stored and returned, with downstream rendering behavior dependent on the client.
- **Impact:** Unwanted content schemes or oversized stored values can cause client rendering/security issues or unnecessarily increase storage and response size.
- **Recommendation:** Restrict to expected `https` URLs and a practical maximum length. If image hosting is intended to be Cloudinary-only, validate the expected host or use an upload flow that returns trusted URLs.

### Positive controls verified

- `router.use(authMiddleware())` protects every backend Feed route (`feed.route.ts:31`); nested comments GET repeats auth (`:71-77`) but this is redundant, not a bypass.
- `postId` and `commentId` are validated with Mongoose ObjectId checks (`feed.validation.ts:4-7,40-42,58-60`); pagination limits are integers between 1 and 50 (`:9-12,51-54`).
- Post create/update accepts only declared schema fields; Zod object parsing strips unknown keys by default, and the service's `$set` uses the parsed input (`feed.validation.ts:15-35`, `feed.service.ts:189-216`). Sensitive fields such as author and counters are not accepted from clients.
- Ownership is checked before update/delete, and both writes constrain the database filter to `_id` plus authenticated owner (`feed.service.ts:194-216,319-342`).
- Prisma queries are parameterized ORM calls; no raw SQL or Mongo query operators are sourced directly from request objects in the reviewed Feed path.
- API error middleware hides unexpected exception details from clients (`errorMiddleware.ts:42-45`), while logging the server-side error.
- `helmet()` is enabled, but CORS is unrestricted (`app.ts:11-18`). The current API uses bearer tokens rather than cookie credentials, so wildcard CORS is not by itself an authentication bypass. Production origins should still be explicitly configured if browser clients are supported.

## C. Performance findings

### P-01 — Comment reads fetch every reply for the page's top-level comments

- **Priority:** High
- **File/function:** `backend/src/modules/feed/feed.service.ts:getComments`, lines 549-576.
- **Current behavior:** Retrieves at most `limit` top-level comments, then queries all replies whose parent is any top-level ID. There is no reply limit or pagination.
- **Implications:** A popular thread can return an arbitrarily large number of reply documents and hydrate/map them in one request. This can dominate database work, memory, response serialization, and network payload despite the top-level `limit <= 50`.
- **Optimization:** Introduce a documented bounded reply policy (for example, preview count plus a separately paginated replies endpoint) and project only fields needed for the response. Preserve the existing response shape carefully if Flutter depends on inline `replies`.
- **Trade-off:** Changes to truncation or endpoint structure affect clients; adding a “has more replies” contract requires Flutter integration.

### P-02 — Full post documents are read for feed pages

- **Priority:** Medium
- **File/function:** `backend/src/modules/feed/feed.service.ts:getFeed`, lines 56-80.
- **Current behavior:** `.lean()` avoids Mongoose document hydration, and results are bounded to `limit + 1`, but Mongo loads all post fields. The response uses a known subset.
- **Implications:** As post schema grows (for example, attachments/moderation metadata), feed reads and serialization carry fields that are not used. Current fields are modest, so this is a scalability risk, not a measured bottleneck.
- **Optimization:** Add a projection for response-required fields and keep the compound sort/cursor fields. Benchmark before adding complexity.
- **Trade-off:** Projections must be kept in sync with response mapping.

### P-03 — Feed page fan-out uses two databases and serializes availability across both

- **Priority:** Medium
- **File/function:** `backend/src/modules/feed/feed.service.ts:getFeed`, lines 88-116.
- **Current behavior:** Each page reads Mongo posts, then in parallel queries PostgreSQL authors and Mongo likes. Batching avoids N+1 behavior and only selects three author fields, but the response depends on both databases.
- **Implications:** Page latency is gated by the slower backend; the dual store adds connection-pool and operational complexity. This is a confirmed cross-store dependency, not proof of a current bottleneck.
- **Optimization:** Track per-store latency and failure rates; consider a carefully maintained author projection/cache only if measurements justify stale profile data. Avoid per-post queries.
- **Trade-off:** Caching introduces invalidation/staleness concerns; denormalization increases write coupling.

### P-04 — Post deletion cleanup loads all comment IDs into application memory

- **Priority:** Medium
- **File/function:** `backend/src/modules/feed/feed.service.ts:344-367`.
- **Current behavior:** Fetches every comment ID for a post, constructs an in-memory array, then deletes likes attached to that array and deletes comments.
- **Implications:** Memory and query payload scale with the number of comments on one post. This accompanies the data-integrity issue D-01.
- **Optimization:** Use a server-side cleanup strategy that avoids transferring every ID (for example, delete comments and likes by post-scoped relationship, or a bounded/background cleanup design with reliable retries). Model likes so cleanup is directly keyed by post where appropriate.
- **Trade-off:** Current comment likes reference comment IDs only, so changing cleanup strategy may require a schema/data migration or a staged deletion design.

### P-05 — Flutter Firestore feed page may scan many posts and performs per-post like reads

- **Priority:** Medium (client-side and integration context)
- **File/function:** `lib/features/posts/data/datasources/firestore_posts_remote_datasource.dart:getFeedPage`, lines 71-119.
- **Current behavior:** Pulls batches of `limit * 3` global Firestore posts until enough allowed authors are found, filtering connections in the client, then performs one likes-document read for each included post. The loop has no fixed maximum batch count.
- **Implications:** Sparse networks can cause many reads/latency; the per-post like lookup is N reads. This is the active datasource registered in `lib/core/config/injection_container.dart:82-88`, not the backend API.
- **Optimization:** If Firestore remains the production path, measure reads and design server-side feed/network filtering plus batched like state where feasible. If the Express backend is intended to replace it, align client transport and business behavior first.
- **Trade-off:** Firestore query limits/index constraints and current connection-based behavior must be preserved or intentionally changed.

## D. Architecture and code quality

1. **Two feed implementations / unclear source of truth:** Backend Mongo/JWT/PostgreSQL behavior and Flutter Firestore/Firebase behavior differ in identity, feed visibility, pagination format, posts, comments, likes, and response DTOs. Flutter currently registers `FirestorePostsRemoteDataSource`; no backend API adapter was found in `lib/features/posts`. This is the highest integration concern. Confirm intended migration state before changing either side.
2. **Mixed PostgreSQL and MongoDB ownership:** Feed documents store string references to PostgreSQL user IDs without database-enforced cross-store foreign keys. User deletion may leave orphan posts/comments; feed author mapping returns `null` for a missing user (`feed.service.ts:118-139`). Define lifecycle cleanup/retention behavior.
3. **Cached counters are duplicated state:** `like_count` and `comment_count` coexist with source records. Every mutation must keep them consistent; current implementation does not guarantee this across failures.
4. **Service layer owns persistence and business logic:** This is consistent enough for the small module, and Prisma/Mongoose repositories are not otherwise established in backend modules. Avoid introducing abstraction layers without broader need. Extract transactional/cleanup helpers only if they clarify tested invariants.
5. **Controller boundary is thin:** Controllers use non-null assertions (`req.validated!`, `req.user!`) based on route middleware ordering. Correct in current route construction, but not statically guaranteed if handlers are reused elsewhere.
6. **Generated Prisma artifacts are committed under `backend/src/generated/prisma`:** Feed uses `@prisma/client` at runtime via shared config; no direct Feed coupling to generated source was observed.
7. **Configuration:** `express.json()` uses its default body-size limit (`backend/src/app.ts:17-18`); an explicit documented API limit would make the contract clear. `cors()` allows all origins (`app.ts:14-15`). Production hardening should configure origins based on actual browser clients.
8. **Maintainability:** `feed.service.ts` combines post, like, comment, cursor encoding, cross-store author resolution, and cleanup (642 lines). Given the module's current size this is not inherently defective, but mutation invariants and cursor helpers merit focused unit tests.

## E. Database optimization and schema observations

### Actual Feed query patterns

| Query | Existing index / observation | Assessment |
|---|---|---|
| `Post.find({}).sort({created_at:-1,_id:-1}).limit(limit+1)` and cursor `$or` on `created_at`, `_id` (`feed.service.ts:56-80`) | `postSchema.index({created_at:-1,_id:-1})` (`models/Post.ts:31-32`) | Good match for global chronological keyset feed; stable tie-breaker avoids same-timestamp ambiguity. Validate with Mongo `explain` on representative data. |
| `Like.find({user_id, post_id:{$in: pageIds}})` (`feed.service.ts:108-115`) | Unique partial index `{user_id:1,post_id:1}` (`models/Like.ts:47-56`) | Supports equality on user and post membership, as well as uniqueness. |
| `Comment.find({post_id,parent_comment_id:null}).sort({created_at:1,_id:1})` (`feed.service.ts:550-564`) | `{post_id:1,parent_comment_id:1,created_at:1}` (`models/Comment.ts:47-51`) | Supports equality prefix and ascending timestamp; `_id` tie-breaker may need verification in explain. Consider adding `_id` as trailing key only if explain/benchmark shows a blocking sort. |
| Reply query `{post_id,parent_comment_id:{$in:topLevelIds}}.sort({created_at:1,_id:1})` (`feed.service.ts:571-576`) | Same index above | Parent lookup uses the first two index keys, but many reply rows can still be returned; response bounding matters more than another index. Verify explain before adding an index. |
| Like deletion for a post and comments (`feed.service.ts:346-367`) | Like indexes are keyed by user first; no direct `post_id`-first index exists | Cleanup by `post_id` may not efficiently use `{user_id,post_id}`. The exact query plan should be checked; a post-first index could improve this cleanup but adds write/storage overhead and does not solve the large comment-ID `$in` path. |
| PostgreSQL `user.findMany({id:{in:authorIds}})` (`feed.service.ts:94-106`) | `users.id` is UUID primary key (`schema.prisma:64-66`) | Indexed lookup; selected fields are appropriately narrow. |

The Prisma schema contains no Feed models: posts, comments, and likes live in MongoDB. No PostgreSQL Feed index is missing based on the actual author lookup. Mongo schema index declarations are visible in source; whether production Mongo collections actually have these indexes is unverified. Check deployed indexes and query plans without running destructive commands.

## F. API review

All routes are mounted at `/api/v1/feed` (`backend/src/app.ts:32-33`) and inherit JWT authentication at `feed.route.ts:31`. Responses use `{success:true,data:...}` on success and `{success:false,message:...}` for application errors.

| Method and path | Auth / validation | Behavior and contract notes | Status/error observations |
|---|---|---|---|
| `GET /api/v1/feed?limit=&cursor=` | JWT; limit 1–50 default 20; cursor is a string decoded/validated by service | Global newest-first feed; returns `{items,next_cursor}` with author, counts, content, image, tags, liked state. | 200; malformed cursor 400; no page returns empty `items`, `next_cursor:null`. |
| `POST /api/v1/feed` | JWT; content trimmed 1–3000, optional URL, tags max 10 and each 1–30 | Creates a post for token user; returns `{id,...,author}`. | 201; missing SQL author 404. |
| `PATCH /api/v1/feed/:postId` | JWT; ObjectId; nonempty subset of content/image/tags | Owner-only update; no GET-single-post or PUT route exists in backend. | 200; missing 404, other owner 403. |
| `DELETE /api/v1/feed/:postId` | JWT; ObjectId | Owner-only delete followed by best-effort comments/likes cleanup. | 200 `{id,deleted:true}` even if cleanup logs a failure (D-01). |
| `POST /api/v1/feed/:postId/like` | JWT; ObjectId | Creates a unique like and increments counter. | 201; duplicate 409; absent post 404. |
| `DELETE /api/v1/feed/:postId/like` | JWT; ObjectId | Deletes the caller's like and decrements counter. | 200; not liked 404. Repeated unlike is not idempotent. |
| `POST /api/v1/feed/:postId/comments` | JWT; ObjectId; content 1–1500; optional parent ObjectId | Creates comment, optionally a one-level reply, increments post count. | 201; missing post/author/parent 404; nested reply 400. |
| `GET /api/v1/feed/:postId/comments?limit=&cursor=` | JWT twice (router-level and route-level); limit 1–50 default 20 | Returns chronological top-level comments with all replies embedded and `next_cursor`. | 200; post missing 404; reply volume unbounded (P-01). |
| `POST /api/v1/feed/comments/:commentId/like` | JWT; ObjectId | Likes comment and increments count. | 201; duplicate 409; missing comment 404. |
| `DELETE /api/v1/feed/comments/:commentId/like` | JWT; ObjectId | Removes caller's comment like and decrements count. | 200; not liked 404. |

The requested standalone “retrieve individual post” endpoint is not registered. Do not treat that as a defect unless the product/API contract requires it; the Flutter interface shown uses feed pages and does not expose a single-post read operation. No backend create/update interface is shown by current Flutter `PostsRemoteDataSource` either.

## G. Testing and reliability recommendations

No backend test/spec files were found under `backend`. Existing `test/features/posts/post_repository_impl_test.dart` tests Flutter repository delegation with a fake datasource; model tests are also Flutter-side. No tests were run during this read-only review.

Add backend integration tests with isolated disposable MongoDB/PostgreSQL fixtures (or controlled test doubles for service invariants), covering:

- Unauthenticated access to every route; expired/invalid JWT; malformed IDs; wrong-owner update/delete.
- Create with 3000 chars, 3001 chars, whitespace-only content, unknown fields, invalid URL schemes/oversized URL, tag bounds, and 413 body handling.
- Empty feed; `limit` lower/upper/out-of-range; equal timestamps; next-page cursor traversal without duplicates; malformed, truncated, and cross-endpoint cursor values.
- Missing post/comment/parent; reply nesting beyond one level; top-level comments and reply pagination/volume limits.
- Duplicate like and repeated unlike; concurrent like/unlike requests; injected DB error between like document and counter update; verify counter invariant.
- Concurrent create-comment vs delete-post; deletion with many comments/likes; injected cleanup failure and recovery behavior.
- PostgreSQL author missing/deleted; Mongo/PostgreSQL outage behavior; ensure no internal error details reach the response.
- Large volume performance tests with `explain` assertions/recorded query plans for feed, comments, likes, and cleanup; avoid fixed latency thresholds without a controlled environment.
- Flutter/backend contract tests once a backend datasource exists, including field names, ID formats, auth token source, global-vs-connected feed visibility, and pagination.

## H. Prioritized improvement roadmap

| Priority | Improvement | Complexity | Expected impact | Dependencies | API break risk |
|---|---|---:|---|---|---|
| **P0** | None established by this static review. No confirmed critical vulnerability was found. | — | — | — | — |
| **P1** | Make like/unlike/comment/count changes atomic or reconcile counters from source records; add concurrency and partial-failure tests. | High | Prevents persistent count drift and failed mutation inconsistency. | Mongo transaction-capable replica set or carefully designed idempotent repair flow. | Low if response retained; operational/database requirements may change. |
| **P1** | Make post deletion and associated cleanup reliable and observable; avoid silent partial deletion. | Medium/High | Prevents orphaned comments/likes and makes failure recovery possible. | Chosen transaction or queued/retryable deletion strategy; deletion contract. | Low to medium; cleanup failure semantics may change. |
| **P1** | Decide whether Flutter should use this backend or Firestore, then align auth, IDs, feed visibility, payloads, and pagination. | High | Resolves split-brain data and the inability to rely on backend audit findings for the client path. | Product/data migration decision; Flutter transport implementation. | High if switching active data source or changing visibility. |
| **P1** | Bound replies returned by comment read and define a reply pagination contract. | Medium | Caps worst-case database work and response size. | Flutter UI/API compatibility plan. | Medium/high if inline `replies` semantics change. |
| **P2** | Add Feed-specific rate limits and abuse monitoring. | Low/Medium | Reduces authenticated write floods and protects database capacity. | Deployment topology for shared limiter. | Low; clients may see 429 under configured thresholds. |
| **P2** | Establish active-user/revocation policy for JWTs and enforce it if immediate deactivation is required. | Medium | Reduces access window for revoked/deleted accounts. | Account lifecycle and cache/TTL policy. | Low/medium; invalidates some existing sessions. |
| **P2** | Constrain image URL scheme/length and explicitly set JSON body limit. | Low | Tightens client safety and predictable request/storage size. | Confirm hosted media policy and max payload expectations. | Low, though existing unusual URLs may be rejected. |
| **P2** | Add backend tests and Mongo query-plan checks for keyset feed and comment queries. | Medium | Makes correctness and index behavior regressions visible. | Test database/CI setup. | None to runtime contract. |
| **P3** | Project feed post fields and verify index deployment/query plans; only add indexes supported by explain. | Low/Medium | May reduce read I/O at scale. | Representative data and query plans. | None; added indexes increase write/storage costs. |
| **P3** | Split feed service responsibilities only when tests or team ownership justify it. | Medium | Improves local reasoning around mutations/cursors. | Test coverage first. | None if behavior preserved. |

## I. Overall assessment

Scores reflect the inspected backend implementation and available backend tests, not a production deployment review.

| Area | Score | Evidence-based rationale |
|---|---:|---|
| Security | **7/10** | JWT protection, schema validation, owner-scoped mutations, controlled query construction, and generic 500 responses are present. Points are withheld for absent Feed abuse limits, unrestricted CORS, URL policy gaps, and lack of active-user revalidation where lifecycle requirements are unknown. |
| Performance | **6/10** | Bounded keyset feed query, `.lean()`, batched author/like reads, and useful indexes are positive. Unbounded inline replies and potentially expensive cleanup dominate risks; production benchmarks/query plans were unavailable. |
| Database efficiency | **6/10** | Actual common read indexes align well with feed and comments; PostgreSQL author lookup uses a primary key. Cross-store dependency and denormalized counters need stronger consistency; cleanup access patterns need explain verification. |
| Code quality | **6/10** | Thin controllers, Zod validation, explicit selects, and modular feature files are positives. The service combines multiple concerns and critical state invariants lack backend tests. |
| Scalability | **5/10** | Keyset pagination and caps help, but all replies can be returned, writes span multiple non-atomic operations, two databases gate each feed page, and deletion work grows with comments. |
| Test coverage | **2/10** | No backend test/spec files were found. Existing feed tests exercise Flutter repository behavior using fakes and do not validate the Express service, authorization, Mongo indexes, or cross-store consistency. |

### Verification limits

- This review inspected source and schema only. No production database, deployed indexes, Mongo replica-set configuration, environment values, CI pipeline, or request logs were available.
- The implementation of `Types.ObjectId.isValid` depends on the installed Mongoose version; this audit confirms that it is called but does not assert every edge case without execution.
- No benchmark results are claimed. Items labeled potential risks should be validated against representative data and query plans.
- `docs/feed/FEED_CURRENT_ARCHITECTURE.md` was absent from the tracked `docs/feed` directory at review time, while an untracked copy exists under `backend/docs/feed`; the existing working tree also contains unrelated modifications/untracked artifacts. This audit did not modify or remove them.
