import { describe, it, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { MockDatabaseFixture } from './fixtures/mockDb.js';
import {
  claimPostForCleanup,
  processClaimedPost,
  runCleanupCycle,
  calculateBackoff,
  startCleanupWorker,
  stopCleanupWorker,
  getCleanupWorkerStatus,
  CleanupWorkerConfig,
  defaultWorkerConfig,
} from '../src/modules/feed/cleanup.worker.js';
import {
  createPost,
  createComment,
  likePost,
  deletePost,
} from '../src/modules/feed/feed.service.js';
import Post from '../src/modules/feed/models/Post.js';
import Like from '../src/modules/feed/models/Like.js';
import Comment from '../src/modules/feed/models/Comment.js';

describe('UniLink Feed - Automatic Post Cleanup Recovery Worker (F-01)', () => {
  const db = new MockDatabaseFixture();

  const authorId = 'worker-author-1';
  const user1 = 'worker-user-1';
  const workerA = 'worker-instance-A';
  const workerB = 'worker-instance-B';

  const testConfig: CleanupWorkerConfig = {
    ...defaultWorkerConfig,
    intervalMs: 1000,
    batchSize: 5,
    commentBatchSize: 10,
    leaseDurationMs: 60000, // 1 min lease
    baseBackoffMs: 1000,
    maxBackoffMs: 60000,
    maxAttempts: 3,
    workerId: workerA,
  };

  before(() => {
    db.install();
  });

  after(async () => {
    await stopCleanupWorker();
    db.restore();
  });

  beforeEach(async () => {
    await stopCleanupWorker();
    db.reset();

    db.users.set(authorId, {
      id: authorId,
      fullName: 'Author User',
      photoUrl: null,
    });
    db.users.set(user1, {
      id: user1,
      fullName: 'Viewer User',
      photoUrl: null,
    });
  });

  // ==========================================
  // 1. Worker Lifecycle (Start / Stop)
  // ==========================================
  describe('Worker Lifecycle', () => {
    it('should start and stop cleanup worker cleanly without errors', async () => {
      assert.equal(getCleanupWorkerStatus().isRunning, false);

      startCleanupWorker({
        intervalMs: 500,
        batchSize: 2,
        workerId: 'test-lifecycle-worker',
      });

      const status = getCleanupWorkerStatus();
      assert.equal(status.isRunning, true);
      assert.equal(status.workerId, 'test-lifecycle-worker');

      // Stop worker
      await stopCleanupWorker();
      assert.equal(getCleanupWorkerStatus().isRunning, false);
    });
  });

  // ==========================================
  // 2. Selection & Eligibility Filtering
  // ==========================================
  describe('Eligibility Filtering & Atomic Claim', () => {
    it('should only claim tombstoned posts and ignore active posts', async () => {
      // 1. Active post (deleted_at: null)
      const activePost = await createPost(authorId, { content: 'Active post' });

      // 2. Tombstoned post awaiting cleanup
      const deadPost = await createPost(authorId, { content: 'Dead post' });
      const rawDead = db.posts.get(String(deadPost.id))!;
      rawDead.deleted_at = new Date();
      rawDead.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 0,
        last_error: null,
        last_attempt_at: null,
        next_retry_at: new Date(Date.now() - 1000), // eligible now
      };

      // Claim
      const claimed = await claimPostForCleanup(workerA, 60000, 3);
      assert.ok(claimed, 'A post should have been claimed');
      assert.equal(String(claimed?._id), String(deadPost.id));

      // Active post was NOT claimed
      const nextClaim = await claimPostForCleanup(workerA, 60000, 3);
      assert.equal(nextClaim, null, 'Active post must never be claimed');
    });

    it('should not claim posts whose retry backoff is in the future', async () => {
      const post = await createPost(authorId, { content: 'Future retry post' });
      const rawPost = db.posts.get(String(post.id))!;
      rawPost.deleted_at = new Date();
      rawPost.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 1,
        last_error: 'Temporary error',
        last_attempt_at: new Date(),
        next_retry_at: new Date(Date.now() + 60000), // In future: 1 minute from now
      };

      const claimed = await claimPostForCleanup(workerA, 60000, 3);
      assert.equal(claimed, null, 'Post with future next_retry_at must not be claimed');
    });

    it('should not claim permanently failed posts', async () => {
      const post = await createPost(authorId, { content: 'Failed post' });
      const rawPost = db.posts.get(String(post.id))!;
      rawPost.deleted_at = new Date();
      rawPost.cleanup_state = {
        status: 'failed',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 5,
        last_error: 'Unrecoverable error',
        last_attempt_at: new Date(),
        next_retry_at: null,
      };

      const claimed = await claimPostForCleanup(workerA, 60000, 3);
      assert.equal(claimed, null, 'Status = failed posts must not be picked up by worker');
    });
  });

  // ==========================================
  // 3. Multi-Instance Safety & Leases
  // ==========================================
  describe('Multi-Instance Safety & Leases', () => {
    it('should not allow two workers to claim the same post concurrently', async () => {
      const post = await createPost(authorId, { content: 'Single contention post' });
      const rawPost = db.posts.get(String(post.id))!;
      rawPost.deleted_at = new Date();
      rawPost.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 0,
        last_error: null,
        last_attempt_at: null,
        next_retry_at: new Date(),
      };

      // Worker A claims first
      const claimA = await claimPostForCleanup(workerA, 60000, 3);
      assert.ok(claimA);
      assert.equal(String(claimA?._id), String(post.id));

      // Worker B attempts to claim the same post while Worker A holds an active lease
      const claimB = await claimPostForCleanup(workerB, 60000, 3);
      assert.equal(claimB, null, 'Worker B must not claim a post actively leased by Worker A');
    });

    it('should allow an expired lease to be reclaimed by another worker', async () => {
      const post = await createPost(authorId, { content: 'Crashed worker post' });
      const rawPost = db.posts.get(String(post.id))!;
      rawPost.deleted_at = new Date();
      // Simulate Worker A claimed it, but crashed, and its lease expired 10 seconds ago
      rawPost.cleanup_state = {
        status: 'cleaning',
        claimed_by: workerA,
        lease_expires_at: new Date(Date.now() - 10000), // Expired!
        attempt_count: 1,
        last_error: null,
        last_attempt_at: new Date(Date.now() - 70000),
        next_retry_at: null,
      };

      // Worker B should be able to reclaim the expired lease
      const claimB = await claimPostForCleanup(workerB, 60000, 3);
      assert.ok(claimB, 'Expired lease must be eligible for reclaim');
      assert.equal(String(claimB?._id), String(post.id));

      const updatedDoc = db.posts.get(String(post.id))!;
      assert.equal(updatedDoc.cleanup_state?.claimed_by, workerB);
      assert.equal(updatedDoc.cleanup_state?.attempt_count, 2);
      assert.ok(updatedDoc.cleanup_state!.lease_expires_at!.getTime() > Date.now());
    });
  });

  // ==========================================
  // 4. Backoff & Partial Failure Recovery
  // ==========================================
  describe('Backoff & Recovery from Failure', () => {
    it('should calculate exponential backoff correctly with capping', () => {
      const b1 = calculateBackoff(1, 1000, 30000);
      const b2 = calculateBackoff(2, 1000, 30000);
      const b3 = calculateBackoff(3, 1000, 30000);
      const bMax = calculateBackoff(10, 1000, 30000);

      assert.ok(b1 >= 900 && b1 <= 1100, `b1 (~1000): ${b1}`);
      assert.ok(b2 >= 1800 && b2 <= 2200, `b2 (~2000): ${b2}`);
      assert.ok(b3 >= 3600 && b3 <= 4400, `b3 (~4000): ${b3}`);
      assert.equal(bMax, 30000, 'Backoff must be capped at maxMs');
    });

    it('should update cleanup_state with backoff and error on failure', async () => {
      const post = await createPost(authorId, { content: 'Will fail post' });
      const rawPost = db.posts.get(String(post.id))!;
      rawPost.deleted_at = new Date();
      rawPost.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 0,
        last_error: null,
        last_attempt_at: null,
        next_retry_at: new Date(),
      };

      // Claim post
      const claimed = (await claimPostForCleanup(workerA, 60000, 3))!;
      assert.ok(claimed);

      // Inject simulated database failure during comment query
      db.setFault('Comment.find', new Error('Simulated network timeout'));

      const result = await processClaimedPost(claimed, testConfig);

      db.clearFault('Comment.find');

      assert.equal(result.status, 'FAILED');
      assert.equal(result.error, 'Simulated network timeout');

      // Verify post document in DB was updated with error state and backoff
      const updatedPost = db.posts.get(String(post.id))!;
      assert.equal(updatedPost.cleanup_state?.status, 'pending');
      assert.equal(updatedPost.cleanup_state?.claimed_by, null);
      assert.equal(updatedPost.cleanup_state?.lease_expires_at, null);
      assert.equal(updatedPost.cleanup_state?.last_error, 'Simulated network timeout');
      assert.ok(updatedPost.cleanup_state!.next_retry_at!.getTime() > Date.now());
    });

    it('should mark post as failed after reaching maxAttempts', async () => {
      const post = await createPost(authorId, { content: 'Max attempts post' });
      const rawPost = db.posts.get(String(post.id))!;
      rawPost.deleted_at = new Date();
      rawPost.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 2, // Next attempt will be attempt 3 = maxAttempts
        last_error: null,
        last_attempt_at: null,
        next_retry_at: new Date(),
      };

      const claimed = (await claimPostForCleanup(workerA, 60000, 3))!;
      assert.equal(claimed.cleanup_state?.attempt_count, 3);

      db.setFault('Comment.find', new Error('Permanent corruption'));
      const result = await processClaimedPost(claimed, testConfig);
      db.clearFault('Comment.find');

      assert.equal(result.status, 'FAILED');

      const updatedPost = db.posts.get(String(post.id))!;
      assert.equal(updatedPost.cleanup_state?.status, 'failed');
      assert.equal(updatedPost.cleanup_state?.claimed_by, null);
    });

    it('should resume and complete cleanup after partial failure', async () => {
      const post = await createPost(authorId, { content: 'Partial cleanup post' });
      // Add comments
      await createComment(user1, String(post.id), { content: 'Comment 1' });
      await createComment(user1, String(post.id), { content: 'Comment 2' });
      await likePost(user1, String(post.id));

      const rawPost = db.posts.get(String(post.id))!;
      rawPost.deleted_at = new Date();
      rawPost.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 1,
        last_error: 'Previous failure',
        last_attempt_at: new Date(Date.now() - 5000),
        next_retry_at: new Date(Date.now() - 1000), // Due now
      };

      // Run cleanup cycle
      const summary = await runCleanupCycle(testConfig);
      assert.equal(summary.processedCount, 1);
      assert.equal(summary.completedCount, 1);
      assert.equal(summary.failedCount, 0);

      // Verify post and comments are completely gone
      assert.equal(db.posts.has(String(post.id)), false);
      assert.equal(db.comments.size, 0);
      assert.equal(db.likes.size, 0);
    });
  });

  // ==========================================
  // 5. Independent Error Isolation
  // ==========================================
  describe('Independent Error Isolation in Batches', () => {
    it('should not let one failing post stop subsequent posts from being cleaned', async () => {
      // Create Post 1 (will fail)
      const post1 = await createPost(authorId, { content: 'Post 1 that fails' });
      const rawPost1 = db.posts.get(String(post1.id))!;
      rawPost1.deleted_at = new Date();
      rawPost1.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 0,
        last_error: null,
        last_attempt_at: null,
        next_retry_at: new Date(),
      };

      // Create Post 2 (will succeed)
      const post2 = await createPost(authorId, { content: 'Post 2 that succeeds' });
      const rawPost2 = db.posts.get(String(post2.id))!;
      rawPost2.deleted_at = new Date();
      rawPost2.cleanup_state = {
        status: 'pending',
        claimed_by: null,
        lease_expires_at: null,
        attempt_count: 0,
        last_error: null,
        last_attempt_at: null,
        next_retry_at: new Date(),
      };

      // Inject fault only when post 1 is being deleted
      let originalDelete = (Post as any).findByIdAndDelete;
      let post1Attempted = false;
      (Post as any).findByIdAndDelete = async (id: any) => {
        if (String(id) === String(post1.id)) {
          post1Attempted = true;
          throw new Error('Post 1 disk error');
        }
        return originalDelete(id);
      };

      const summary = await runCleanupCycle(testConfig);

      (Post as any).findByIdAndDelete = originalDelete;

      assert.equal(summary.processedCount, 2);
      assert.equal(summary.failedCount, 1, 'Post 1 must be recorded as failed');
      assert.equal(summary.completedCount, 1, 'Post 2 must be recorded as completed');

      // Post 1 remains with error state; Post 2 is deleted
      assert.ok(db.posts.has(String(post1.id)), 'Post 1 should remain in DB for retry');
      assert.equal(db.posts.has(String(post2.id)), false, 'Post 2 should be deleted');
    });
  });

  // ==========================================
  // 6. Legacy Document Deletion (F5 Verification)
  // ==========================================
  describe('Legacy Post Deletion Without deleted_at Field (F5)', () => {
    it('should successfully delete a legacy post missing the deleted_at field', async () => {
      // Simulate legacy post created before schema update (no deleted_at key)
      const post = await createPost(authorId, { content: 'Legacy post with no deleted_at' });
      const rawPost = db.posts.get(String(post.id))!;
      delete (rawPost as any).deleted_at;

      assert.equal((rawPost as any).deleted_at, undefined);

      // deletePost should now succeed instead of throwing 404
      const result = await deletePost(authorId, String(post.id));
      assert.equal(result.deleted, true);

      // Verify post was cleaned up
      assert.equal(db.posts.has(String(post.id)), false);
    });
  });
});

