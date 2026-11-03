# UniLink Feed Backend — Phase 1 Independent Verification

**Review date:** 2026-11-03  
**Review mode:** Read-only source and test inspection. Tests/build were not executed. The only file created was this requested report; no source, test, database, or configuration files were changed.  
**Verdict: NOT APPROVED** for production-reliability claims. The Replica Set transaction path is directionally sound for the inspected workflows, but the Standalone compensation path does not guarantee counter invariants, deletion cleanup is not fully race-safe, retry is not scheduled, and the submitted tests do not exercise real MongoDB transaction semantics.

## A. Overall verdict

**NOT APPROVED.** Phase 1 improves the prior implementation with transactions, compensation attempts, tombstones, and bounded cleanup. However, the implementation report overstates guarantees. The standalone path can lose consistency after a failed unlike update or an ambiguous write/failed compensation. Deleting a legacy post without `deleted_at` fails. A comment can receive a like after cleanup has already removed its likes but before the comment is deleted. Failed cleanup is only discoverable by a helper that is not scheduled or called by application startup. No real Replica Set or Standalone integration test evidence was supplied.

The review does not establish that every deployment is currently exposed to every risk: the configured MongoDB topology and deployed indexes were not available for inspection. The claims “strict serializability,” “all operations consistent on standalone,” and “automatically retryable cleanup” are not supported by the inspected source.

## B. Critical findings

### F1 — Standalone unlike has no compensation if counter update fails

- **Severity:** High (data integrity)
- **Location:** `backend/src/modules/feed/feed.service.ts:319-360`; especially delete at 321-326 and counter update at 333-350.
- **Technical explanation:** With `session === null`, `Like.findOneAndDelete` commits independently. If the later post/comment counter update throws or returns no record, the deleted like is not restored. Unlike the like creation paths, neither `unlikePost` nor `unlikeComment` compensates the first mutation.
- **Reproduction scenario:** On a Standalone server or forced fallback, seed one like and matching count 1; make the `Post.findOneAndUpdate` (or `Comment.findByIdAndUpdate`) fail after `Like.findOneAndDelete` succeeds. Result: zero like documents but count remains 1. An absent target document also produces 404 after the like was already removed.
- **Impact:** `like_count !== persisted likes` until repaired; user sees an error even though their like was removed.
- **Recommended fix:** For production, require transaction-capable topology for these invariants or implement durable, idempotent compensation/reconciliation for both deletion and counter update, including ambiguous network outcomes. Do not describe best-effort compensation as atomic.

### F2 — Standalone compensation is best effort and cannot handle ambiguous write outcomes

- **Severity:** High (data integrity)
- **Location:** `backend/src/modules/feed/feed.service.ts:278-304,292-302` (post like); `:586-609,595-607` (comment creation); `:662-687,675-684` (comment like).
- **Technical explanation:** Compensation calls suppress their own failures with `.catch(() => {})`. Also, a network timeout can be returned after MongoDB applied the counter update. In that case, deleting the just-created like/comment may succeed while the counter increment remains. For comment creation, if the `Comment.create` write applied but its acknowledgement was lost, execution never assigns `createdComment`, so the later compensation branch is never reached.
- **Reproduction scenario:** In fallback mode, have the server apply a counter increment but simulate an acknowledgement timeout; service catches the error and deletes the source record. Or have the compensation delete fail after a counter update error. Both leave count/source mismatch. These are failure-injection scenarios; not reproduced against a live database in this review.
- **Impact:** Persistent drift despite an error response. A process crash between writes also leaves partial state.
- **Recommended fix:** Treat standalone mode as weaker, non-atomic behavior and either disable these multi-document mutations there, use a durable operation/outbox/reconciliation design, or constrain product reliability claims. Record and alert on failed compensation rather than swallowing it.

### F3 — Comment likes can be orphaned during staged post cleanup

- **Severity:** High (data integrity / cleanup correctness)
- **Location:** `backend/src/modules/feed/feed.service.ts:381-409` (cleanup ordering), `:629-693` (`likeComment`), and `:747-825` (`getComments` post check; current comment reads are tied to active post).
- **Technical explanation:** Cleanup deletes comment likes for a batch at lines 395-399, then deletes comments at 402-405. `likeComment` checks only `Comment.findById` at 631-633; it does not verify the parent post is active. A request can insert a comment-like after the cleanup query has deleted likes for that comment but before cleanup deletes the comment. Cleanup then removes the comment, leaving the new `Like.comment_id` orphaned. On a Replica Set, the like transaction does not include/serialize against the cleanup's standalone `deleteMany` and subsequent comment deletion as one transaction.
- **Reproduction scenario:** Tombstone a post with a comment; cleanup selects a batch and completes `Like.deleteMany(comment_id in batch)`; concurrently call `likeComment` for a comment in that batch; allow cleanup to delete the comment. The like remains after parent comment deletion.
- **Impact:** Orphaned like documents and unreliable cleanup accounting/storage. Comment itself is no longer accessible through the active post API, but the dangling record persists.
- **Recommended fix:** Coordinate child mutations with parent tombstone/deletion and make cleanup race-safe (for example, make comment mutation verify active parent and use an agreed locking/versioning protocol, or repeat/drain cleanup after mutations are quiesced). Test the interleaving against real MongoDB.

### F4 — Cleanup retry exists as a function but is not scheduled or invoked by the application

- **Severity:** High (recovery reliability)
- **Location:** `backend/src/modules/feed/feed.service.ts:420-437`; invocation found only in `backend/test/feed.service.test.ts:523-525`. No application, server, cron, or worker call was found under `backend/src`.
- **Technical explanation:** `deletePost` catches cleanup errors, logs them, and returns `{deleted:true}` (`feed.service.ts:480-498`). A tombstoned post remains discoverable by `retryOrphanedPostCleanups`, but nothing in runtime invokes that function. The cleanup is synchronous request work, not a background job, despite the log wording.
- **Reproduction scenario:** Tombstone a post and inject a cleanup failure in production; receive a successful delete response. Unless an operator manually invokes the exported function, the tombstone and residual children remain indefinitely.
- **Impact:** Stuck tombstones and persistent orphaned child data after any transient cleanup failure.
- **Recommended fix:** Invoke cleanup from a durable scheduled/worker mechanism with monitoring, bounded retries, and an operational way to inspect failures. Alternatively, return/record an explicit incomplete state and document the manual recovery path.

### F5 — Legacy posts without `deleted_at` cannot be deleted

- **Severity:** Medium (functional regression)
- **Location:** `backend/src/modules/feed/feed.service.ts:445-450`.
- **Technical explanation:** Mongo documents created before the new field was introduced have `post.deleted_at === undefined`. The guard `post.deleted_at !== null` treats `undefined` as already deleted and returns 404. Elsewhere, `{deleted_at:null}` is intentionally used to match both null and missing fields, and the implementation report claims historical-document compatibility.
- **Reproduction scenario:** Load a legacy post document with no `deleted_at` key, authenticate its owner, and call delete. The initial fetch succeeds, but line 449 returns 404 before tombstoning.
- **Impact:** Existing posts lacking the new field cannot be deleted by their owners through this endpoint.
- **Recommended fix:** Treat absent and null as active consistently, and add a legacy-document test.

### F6 — Retry can claim cleanup succeeded even when cleanup did not delete the post

- **Severity:** Medium (recovery observability)
- **Location:** `backend/src/modules/feed/feed.service.ts:408-437`.
- **Technical explanation:** `cleanupPostResources` can return `postDeleted:false` without throwing when the post has already been deleted by another worker (line 415). `retryOrphanedPostCleanups` increments `cleaned` unconditionally after any resolved call (line 431). Therefore its count means “calls resolved,” not “tombstoned posts completed”; concurrent workers or orphaned child rows can be reported as cleaned. The helper also has no claim/lease, so multiple workers can process the same tombstone at once.
- **Reproduction scenario:** Two retry workers select the same tombstone. One removes the post first; the other finishes a no-op hard delete and increments its cleaned count. More concerning, if children are added by a race after the first worker's relevant batch, the second call's result can mask residual data.
- **Impact:** Misleading monitoring/maintenance reports and duplicate work; non-atomic cleanup can overlap with mutations.
- **Recommended fix:** Return and aggregate explicit completion results, use a lease/claim or idempotent queue semantics, and only report complete after verifying no related children remain.

### F7 — Transaction fallback classifies every Mongo error code 20 as unsupported topology

- **Severity:** Medium (incorrect fallback / retry risk)
- **Location:** `backend/src/utils/transaction.ts:65-82`, particularly `errCode === 20` at line 72 and rerun at line 79.
- **Technical explanation:** Code 20 is `IllegalOperation`, but the implementation treats any error carrying that code as proof transactions are unsupported. The string checks are also broad. On a match it calls `work(null)` again after the transactional attempt has failed. In the normal standalone topology, detection (`Single`) should select fallback before starting a transaction, so this path should be rare; nevertheless, errors unrelated to unsupported transactions can be misclassified. Re-execution can duplicate a mutation if the first attempt had an externally visible effect or an ambiguous commit outcome. The inspected callbacks currently contain MongoDB work only, and Mongo transactions roll back uncommitted writes, so a concrete duplicate from the current callback was not demonstrated; the fallback decision is still unsafe and not topology-specific.
- **Recommended fix:** Only fall back on a narrowly identified server capability error received before any transaction work can commit, preferably after a topology-based capability determination. Never rerun a unit of work after an ambiguous commit outcome; use MongoDB error labels and driver transaction semantics.

### F8 — Topology detection depends on private driver internals and silently downgrades unknown topologies

- **Severity:** Medium (transaction guarantee may silently disappear)
- **Location:** `backend/src/utils/transaction.ts:8-32`.
- **Technical explanation:** It type-asserts and reads `client.topology.description.type`, an internal driver shape. Any absent/unknown topology returns `false`, which runs all multi-document callbacks without a session (`:52-55`). The behavior is fail-open to weaker consistency: it does not fail closed or emit a high-severity signal. Driver upgrades may change this private shape.
- **Scenario / impact:** A topology type not listed or a driver change is interpreted as transaction unsupported; calls silently switch to nontransactional compensations while production assumes ACID behavior.
- **Recommended fix:** Use a supported capability/configuration strategy, make transaction mode explicit/observable at startup, and fail closed for production mutation guarantees when topology cannot be verified.

## C. Transaction guarantees

| Execution mode | Actual behavior in source | Guarantee assessment |
|---|---|---|
| Replica Set / sharded transaction-capable topology | `runInTransaction` starts a session and wraps callback in `session.withTransaction` (`transaction.ts:58-64`). `likePost`, `unlikePost`, comment creation, and comment likes attach the session to the reads/writes shown in `feed.service.ts:244-310,319-360,524-620,629-743`. | For operations successfully included in the transaction, MongoDB provides multi-document atomic commit/rollback and snapshot transaction semantics. This is **not a claim of strict serializability**. Retry behavior is delegated to the driver `withTransaction`; callback operations may be re-run after transient transaction errors. Cleanup/deletion is not included in these transactions. |
| Standalone detected as topology `Single` | Calls callback once with `null` (`transaction.ts:52-55`); service sequences independent writes and attempts best-effort compensating deletes for create-like/create-comment operations. | No ACID guarantee. Individual document writes are atomic, but the workflow can partially commit due to crashes, ambiguous acknowledgements, or failed compensation. Unlike has no compensation. No reconciliation worker is scheduled. |
| Capability unknown / connection not ready | Also takes the `work(null)` path (`transaction.ts:9-24,52-55`). | Silent downgrade to fallback; if not actually connected, operations fail, but if topology introspection fails while writes work, consistency is weaker without startup warning. |
| Runtime error deemed unsupported | Catches code 20 / selected messages and invokes callback again without session (`transaction.ts:65-80`). | Error classification is broader than “genuinely unsupported” and can repeat callback logic. No proof of duplicate effects in present callbacks, but this is an unsafe retry boundary. |

The implementation report's “Strict Serializability / ACID Atomicity” wording is too strong. Atomicity is provided for each successful transaction, while other code paths—especially staged deletion and cleanup—are separate nontransactional workflows.

## D. Race-condition analysis

| Scenario | Replica Set path | Standalone / cleanup path | Assessment |
|---|---|---|---|
| Two simultaneous likes by same user | Unique partial index on `(user_id,post_id)` rejects duplicate insertion (`Like.ts:47-56`); transaction abort prevents a second counter increment. | Same unique index is relied on; one create should win, assuming index exists in deployment. | Correctness is plausible if the unique index is deployed. Mock fixture serializes writes and does not prove Mongo contention behavior. |
| Two simultaneous unlike requests | Both delete/counter operations are in transactions; write conflict/transaction retry should lead to one successful deletion and one no-like result. | Atomic `findOneAndDelete` should allow only one request to obtain the record; the other returns 404. The successful request can still lose consistency if decrement fails (F1). | No demonstrated double decrement for this interleaving; fallback still has failure gap. |
| Like and unlike simultaneously | Unique constraint and transaction write conflicts provide a serializable order of source-record changes; whichever commits last determines liked state. | Individual insert/delete are atomic, but concurrent compensations and counter operations are not an atomic state transition. Outcomes may be ordered inconsistently on errors/timeouts. | Test needed on actual Mongo; fixture cannot establish the order. |
| Like and post deletion simultaneously | Like transaction's active-post check and counter update should conflict with tombstone write on the same post; transaction retries/re-evaluates or fails. Cleanup is outside that transaction. | Post tombstone prevents final like counter update (`likePost` filter includes `deleted_at:null`) and compensation attempts to remove new like; compensation failure can leave orphan like. Cleanup's early delete can race with a late insert. | Tombstone helps but no complete standalone guarantee. |
| Comment creation and post deletion simultaneously | Create transaction reads and updates active post; deletion tombstone writes that same post. A write conflict/retry or failed active-post predicate should prevent a committed comment after deletion. | Create uses active predicate on counter increment (`:588-609`) and tries to delete comment on failure. Cleanup can race; a failed compensation or ambiguous create acknowledgement can orphan it. | Not guaranteed in standalone. Real interleaving tests absent. |
| Comment like and comment cleanup simultaneously | Like transaction writes both like and comment, while cleanup independently deletes likes and then comment. If cleanup's like delete occurs first, like transaction can commit before comment deletion and leave a like after comment is deleted. | Same race, without transaction conflict protection. `likeComment` does not check parent tombstone. | Confirmed design gap (F3). |
| Multiple cleanup workers on one tombstoned post | Cleanup has no transaction/lease; individual deletes are idempotent but interleavings are not coordinated. | Same. Both may select the same comment batch; one may delete it before the other. Late child mutation can occur during either worker. | Duplicate work is expected; helper count can overstate completed cleanup (F6). |

## E. Counter integrity assessment

| Invariant | Replica Set | Standalone | Conclusion |
|---|---|---|---|
| `Post.like_count = persisted post likes` | Like insert/delete plus counter mutation share one transaction in service. Unique index prevents duplicates if deployed. | Like path compensates but suppresses compensation errors and cannot handle ambiguous acknowledgements. Unlike has no compensation. | Not guaranteed in standalone. Existing drift is not reconciled. |
| `Post.comment_count = comments for post` | Comment insert and post increment share transaction. | Insert then increment with best-effort comment deletion on failure; lost acknowledgement/failed delete can drift. | Not guaranteed in standalone. Existing drift is not reconciled. |
| `Comment.like_count = persisted comment likes` | Like insert/delete and comment count mutation share transaction, but comment cleanup is not in that transaction. | Like insertion has best-effort compensation; unlike has none; cleanup race may orphan likes. | Not guaranteed during cleanup or failures. |

The nonnegative `$max` pipeline (`feed.service.ts:333-343,716-726`) avoids decrementing below zero, but it can conceal pre-existing drift; it does not establish equality. No periodic counter reconciliation is present in inspected source.

## F. Deletion and recovery assessment

- Tombstoning filters active feed reads (`feed.service.ts:56-83`) and most post mutation checks. `likeComment` is an exception: it checks only the comment, not whether its parent post is tombstoned (`:629-635`). Unlike operations do not require an active parent; they do not create new child records but can race with cleanup.
- `cleanupPostResources` performs bounded comment ID batches of `batchSize` (`:383-405`), removes post likes first, comment likes before each comment batch, then physically deletes the post (`:408-415`). Normal memory is O(batchSize), but the parameter is not validated: `batchSize=0` is passed as `.limit(0)`, which MongoDB treats as no result limit, defeating the claimed bound and potentially preventing loop progress. Runtime call sites use the default 500; the function is exported and tests call it with a chosen size.
- Deletion cleanup is not atomic and has no coordination with child mutations or concurrent workers. A tombstoned parent prevents ordinary post creation/like but not comment liking of existing children.
- Cleanup failure leaves tombstone discoverable only if the tombstone write succeeded and the document remains. The retry function queries tombstones and logs per-post errors (`:420-437`), but no runtime scheduling/invocation exists.
- On interruption before final post deletion, a later manual retry can resume because batches delete their processed comments. There is no guarantee it will run automatically. If interruption occurs after the final hard delete, the function's ordering means all batches completed in that invocation, though a concurrent child mutation may still have raced.

## G. Database index assessment

### Schema declarations

- `Post.ts:33-35`: `{author_id:1,created_at:-1}`, `{created_at:-1,_id:-1}`, `{deleted_at:1,created_at:-1,_id:-1}`. Current feed filters `deleted_at:null` and sorts by `created_at:-1,_id:-1` (`feed.service.ts:56-83`), so the new compound index matches that pattern. The old global sort index may overlap for the sort portion; its value should be confirmed via query plans before removing it. Author/date index has no matching author-scoped Feed query in the inspected service.
- `Comment.ts:48-57`: `(post_id,parent_comment_id,created_at asc)` matches top-level comment and parent reply filters; the separate `(post_id,created_at desc)` supports post-scoped chronological access by scanning in reverse where applicable. Confirm actual plans with `explain`.
- `Like.ts:47-66`: unique partial indexes enforce one like per user per post/comment when the reference is an ObjectId. `:69-85` direct partial indexes on `post_id` and `comment_id` support cleanup queries that lack a `user_id` prefix. These have write/storage cost but correspond to actual deletion filters at `feed.service.ts:378,396`.
- The Mongoose schema indexes are declarations only. `backend/src/config/mongodb.ts:4-8` calls `mongoose.connect(env.mongodbUri)` without explicit `autoIndex` configuration. No production `getIndexes()` output, migration/index deployment step, index build history, or database topology was reviewed. **Production index existence is unverified.** Existing duplicates could also prevent creation of a new unique index; data was not inspected.
- Legacy post query compatibility: `{deleted_at:null}` matches missing `deleted_at` fields in MongoDB query semantics, but the delete precondition at `feed.service.ts:449` does not treat undefined as active (F5).

## H. Test quality assessment

The implementation report claims 24 passing tests. Static inspection found **19 `it(...)` cases** in `backend/test/feed.service.test.ts` and **5** in `backend/test/feed.api.test.ts`. This review did not execute them, so “passing” is not independently verified.

### Classification and what the tests prove

- **Unit / mock-based service tests:** The service suite imports production service functions but replaces Mongoose statics and Prisma methods with `MockDatabaseFixture` maps (`mockDb.ts:45-103`). It can check selected control flow and final in-memory state under injected failures.
- **Mock-based concurrency tests:** `Promise.all`/`allSettled` invokes multiple promises (`feed.service.test.ts:153-163,181-190,280-290`), but all operations mutate JavaScript `Map`s in one process. The fixture methods are immediate/serialized JavaScript logic and do not implement Mongo lock/write-conflict semantics, transactions, isolation, retry labels, or ambiguous commit results. These cases show behavior under this fake, not real concurrent database behavior.
- **Transaction simulation:** Not present. The fixture `.session()` methods are no-ops (`mockDb.ts:179-182,224-227,335-337,409-412,461-463`). There is no mock for `mongoose.startSession()` or `withTransaction`. With no Mongo connection, `isTransactionSupported()` chooses `work(null)`; several failure tests explicitly set `forceFallback:true`. Thus tests exercise fallback control flow, not Replica Set transactions or callback retry.
- **API tests:** Despite their names, `feed.api.test.ts` constructs fake `Request` and `Response` objects and directly invokes controllers (`:16-37,68-82` etc.). They do not start Express, route middleware, auth, Zod validation, error middleware, JSON parsing, HTTP serialization, or sockets. They verify controller status/payload assignments only.
- **Real MongoDB integration tests:** None found.
- **End-to-end HTTP tests:** None found.

### Important omissions / false confidence risks

- No unlike counter-update failure test (F1); no failed compensation test; no ambiguous acknowledgement or process crash simulation.
- No like/unlike versus delete, comment create versus delete, comment-like versus cleanup, or simultaneous cleanup-worker interleaving.
- Cleanup failure test manually sets `deleted_at` and directly calls cleanup/retry (`feed.service.test.ts:497-530`); it does not call `deletePost`, and therefore does not verify request behavior or runtime scheduling.
- The cleanup batch test uses 25 rows and batch size 10, which shows loop batching against the fake; it does not verify bounded Mongo cursor memory or query plans.
- The fake matcher omits many Mongo query semantics (e.g. array operators in general) and does not model deleted_at-missing legacy shape: mock docs always set `deleted_at` to null (`mockDb.ts:201-214`). It therefore cannot catch F5.

### Required database verification

Add isolated integration suites against a disposable MongoDB Replica Set and a disposable Standalone server. Verify actual session propagation, duplicate-key behavior, transaction callback retries, state after injected failures, query plans, cleanup races, and index definitions. Do not point these suites at development or production databases. Keep Express/Supertest-style end-to-end tests separate from service integration tests.

## I. Required fixes

### P0 — Critical correctness / data-loss risks

No P0 item was established by this static review. This does not mean the Standalone consistency gaps are acceptable for production; address the P1 items before relying on standalone operation.

### P1 — Reliability and correctness

1. Fix unlike failure behavior and define deployment policy for multi-document invariants. **Complexity: High.** Impact: prevents count/record drift. Dependencies: transaction-capable Mongo or durable reconciliation. API break: none expected.
2. Make compensation failures observable and recoverable; handle ambiguous acknowledgement semantics rather than swallowing rollback errors. **Complexity: High.** Impact: reduces standalone corruption risk. API break: none expected.
3. Prevent child mutations while parent post is tombstoned and make cleanup synchronize with in-flight child writes. **Complexity: High.** Impact: prevents orphan likes/comments. API break: likely none, but races may now return 404 sooner.
4. Schedule a durable cleanup worker or make incomplete cleanup operationally visible; implement claim/retry semantics. **Complexity: Medium/High.** Impact: ensures tombstones eventually drain. API break: none if existing 200 semantics retained.
5. Accept missing `deleted_at` as active in delete checks and test legacy documents. **Complexity: Low.** Impact: restores delete functionality. API break: none.
6. Tighten transaction unsupported-error detection and remove unsafe generic callback rerun. **Complexity: Medium.** Impact: avoids accidental downgrade/re-execution. API break: may cause unsupported deployment mutations to return errors instead of using fallback; explicitly define contract.

### P2 — Performance and maintainability

1. Validate `batchSize` as a positive bounded integer and verify cleanup loop progress (`feed.service.ts:364-387`). **Complexity: Low.** Prevents `.limit(0)` from defeating bounded memory.
2. Return accurate retry completion metrics; add a lease/claim if multiple workers are supported. **Complexity: Medium.** Prevents duplicate work and misleading ops data.
3. Add real Replica Set and Standalone integration suites, plus HTTP route-level tests. **Complexity: High.** Essential evidence for claims; no API break.
4. Inspect deployment indexes and explain plans; run controlled unique-index preflight before rollout. **Complexity: Medium.** Deployment-only; no API break.
5. Add reconciliation/diagnostic command for post/comment counters and orphan children. **Complexity: Medium.** Repairs historical drift and detects failures; operational tooling only.

### P3 — Optional improvements

1. Remove or retain overlapping Post indexes only after production query-plan and write-cost evidence (`Post.ts:33-35`).
2. Replace private topology introspection with a supported and explicit capability/configuration mechanism, with startup diagnostics.
3. Add metrics for transaction mode, retries, compensation attempts/failures, cleanup age, batch counts, and remaining tombstones.

## J. Phase 2 readiness

**Not ready for Phase 2 performance optimization as a production baseline.** First resolve the P1 consistency/recovery issues and establish real MongoDB integration evidence for both supported deployment modes. Performance optimization on top of unverified mutation and cleanup semantics risks tuning a system whose counters and child records can diverge. Index declarations also need deployment verification and real query plans before they can serve as a performance baseline.

## Verification limits

- No MongoDB or PostgreSQL instance was inspected or contacted. Deployed topology, indexes, existing duplicate data, and historical document shapes are unknown.
- Tests and TypeScript build were not executed. Test counts/classification above are based on source inspection; the “24 passed” claim comes from the supplied implementation report, not this verification run.
- No production or development database tests were run.
