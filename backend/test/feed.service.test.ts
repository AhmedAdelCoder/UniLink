import { describe, it, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { MockDatabaseFixture } from './fixtures/mockDb.js';
import {
  createPost,
  likePost,
  unlikePost,
  likeComment,
  unlikeComment,
  createComment,
  deletePost,
  getFeed,
  cleanupPostResources,
  retryOrphanedPostCleanups,
} from '../src/modules/feed/feed.service.js';
import Post from '../src/modules/feed/models/Post.js';
import Like from '../src/modules/feed/models/Like.js';
import Comment from '../src/modules/feed/models/Comment.js';

describe('UniLink Feed Service - Phase 1 Data Integrity & Reliability Tests', () => {
  const db = new MockDatabaseFixture();

  const authorId = 'user-uuid-111';
  const user1 = 'user-uuid-222';
  const user2 = 'user-uuid-333';
  const user3 = 'user-uuid-444';

  before(() => {
    db.install();
  });

  after(() => {
    db.restore();
  });

  beforeEach(() => {
    db.reset();

    // Seed test users in PostgreSQL mock
    db.users.set(authorId, {
      id: authorId,
      fullName: 'Post Author',
      photoUrl: 'https://example.com/author.png',
    });
    db.users.set(user1, {
      id: user1,
      fullName: 'User One',
      photoUrl: 'https://example.com/user1.png',
    });
    db.users.set(user2, {
      id: user2,
      fullName: 'User Two',
      photoUrl: 'https://example.com/user2.png',
    });
    db.users.set(user3, {
      id: user3,
      fullName: 'User Three',
      photoUrl: 'https://example.com/user3.png',
    });
  });

  // ==========================================
  // 1. Post Like / Unlike Consistency
  // ==========================================
  describe('Post Like / Unlike Consistency', () => {
    it('should successfully like a post and increment like_count by 1', async () => {
      const post = await createPost(authorId, { content: 'Hello World' });
      assert.equal(post.like_count, 0);

      const result = await likePost(user1, String(post.id));
      assert.equal(result.liked, true);
      assert.equal(result.like_count, 1);

      // Verify actual data invariants in database
      const dbPost = db.posts.get(String(post.id));
      assert.ok(dbPost);
      assert.equal(dbPost.like_count, 1);

      const dbLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id) && l.user_id === user1
      );
      assert.equal(dbLikes.length, 1);
    });

    it('should prevent duplicate likes from incrementing counter twice (409 Conflict)', async () => {
      const post = await createPost(authorId, { content: 'Post for duplicate like' });
      await likePost(user1, String(post.id));

      // Attempt second like by the same user
      await assert.rejects(
        async () => {
          await likePost(user1, String(post.id));
        },
        {
          name: 'AppError',
          message: 'Post already liked',
          statusCode: 409,
        }
      );

      // Counter must remain 1, not 2
      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.like_count, 1);

      // Only one like document must exist
      const likesCount = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id)
      ).length;
      assert.equal(likesCount, 1);
    });

    it('should successfully unlike a post and decrement like_count', async () => {
      const post = await createPost(authorId, { content: 'Post to unlike' });
      await likePost(user1, String(post.id));

      const unlikeResult = await unlikePost(user1, String(post.id));
      assert.equal(unlikeResult.liked, false);
      assert.equal(unlikeResult.like_count, 0);

      // Invariants check
      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.like_count, 0);

      const dbLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id)
      );
      assert.equal(dbLikes.length, 0);
    });

    it('should prevent repeated unlike from decrementing counter below 0 (404 Not Found)', async () => {
      const post = await createPost(authorId, { content: 'Post double unlike' });
      await likePost(user1, String(post.id));
      await unlikePost(user1, String(post.id));

      // Attempt second unlike
      await assert.rejects(
        async () => {
          await unlikePost(user1, String(post.id));
        },
        {
          name: 'AppError',
          message: 'Post not liked',
          statusCode: 404,
        }
      );

      // Counter must remain 0 and never drop below 0
      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.like_count, 0);
    });

    it('should handle concurrent like requests safely (exactly one succeeds)', async () => {
      const post = await createPost(authorId, { content: 'Concurrent likes test' });

      // Run 5 simultaneous like requests from the same user
      const results = await Promise.allSettled([
        likePost(user1, String(post.id)),
        likePost(user1, String(post.id)),
        likePost(user1, String(post.id)),
        likePost(user1, String(post.id)),
        likePost(user1, String(post.id)),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one concurrent like must succeed');
      assert.equal(rejected.length, 4, 'Remaining 4 must fail with duplicate error');

      // Database invariants
      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.like_count, 1, 'Counter must be exactly 1');

      const dbLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id) && l.user_id === user1
      );
      assert.equal(dbLikes.length, 1, 'Only one like record must exist in database');
    });

    it('should handle concurrent unlike requests safely', async () => {
      const post = await createPost(authorId, { content: 'Concurrent unlike test' });
      await likePost(user1, String(post.id));

      // Run 3 simultaneous unlike requests
      const results = await Promise.allSettled([
        unlikePost(user1, String(post.id)),
        unlikePost(user1, String(post.id)),
        unlikePost(user1, String(post.id)),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one concurrent unlike must succeed');
      assert.equal(rejected.length, 2, 'Remaining must fail with 404');

      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.like_count, 0, 'Counter must not underflow');
    });
  });

  // ==========================================
  // 2. Comment Like / Unlike Consistency
  // ==========================================
  describe('Comment Like / Unlike Consistency', () => {
    it('should successfully like and unlike a comment maintaining counter invariants', async () => {
      const post = await createPost(authorId, { content: 'Post with comment' });
      const comment = await createComment(user1, String(post.id), {
        content: 'Nice post!',
      });
      assert.equal(comment.like_count, 0);

      // Like comment
      const likeRes = await likeComment(user2, String(comment.id));
      assert.equal(likeRes.liked, true);
      assert.equal(likeRes.like_count, 1);

      let dbComment = db.comments.get(String(comment.id));
      assert.equal(dbComment?.like_count, 1);

      // Duplicate like comment fails
      await assert.rejects(
        async () => {
          await likeComment(user2, String(comment.id));
        },
        {
          name: 'AppError',
          message: 'Comment already liked',
          statusCode: 409,
        }
      );
      assert.equal(db.comments.get(String(comment.id))?.like_count, 1);

      // Unlike comment
      const unlikeRes = await unlikeComment(user2, String(comment.id));
      assert.equal(unlikeRes.liked, false);
      assert.equal(unlikeRes.like_count, 0);

      assert.equal(db.comments.get(String(comment.id))?.like_count, 0);

      // Repeated unlike comment fails
      await assert.rejects(
        async () => {
          await unlikeComment(user2, String(comment.id));
        },
        {
          name: 'AppError',
          message: 'Comment not liked',
          statusCode: 404,
        }
      );
      assert.equal(db.comments.get(String(comment.id))?.like_count, 0);
    });
  });

  // ==========================================
  // 3. Comment Creation Consistency
  // ==========================================
  describe('Comment Creation Consistency', () => {
    it('should create comment and increment post comment_count', async () => {
      const post = await createPost(authorId, { content: 'Post for comments' });
      assert.equal(post.comment_count, 0);

      const comment = await createComment(user1, String(post.id), {
        content: 'Great insight!',
      });

      assert.equal(comment.content, 'Great insight!');
      assert.equal(comment.parent_comment_id, null);

      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.comment_count, 1);

      const dbComment = db.comments.get(String(comment.id));
      assert.ok(dbComment);
      assert.equal(dbComment.content, 'Great insight!');
    });

    it('should handle concurrent comment creation safely and accurately', async () => {
      const post = await createPost(authorId, { content: 'Concurrent comments post' });

      // Run 5 simultaneous comments from various users
      await Promise.all([
        createComment(user1, String(post.id), { content: 'Comment 1' }),
        createComment(user2, String(post.id), { content: 'Comment 2' }),
        createComment(user3, String(post.id), { content: 'Comment 3' }),
        createComment(user1, String(post.id), { content: 'Comment 4' }),
        createComment(user2, String(post.id), { content: 'Comment 5' }),
      ]);

      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.comment_count, 5, 'Post comment_count must match exactly 5');

      const postComments = Array.from(db.comments.values()).filter(
        (c) => String(c.post_id) === String(post.id)
      );
      assert.equal(postComments.length, 5, 'Exact 5 comment documents must exist');
    });

    it('should validate parent comments belong to the same post', async () => {
      const postA = await createPost(authorId, { content: 'Post A' });
      const postB = await createPost(authorId, { content: 'Post B' });

      // Comment on Post A
      const commentA = await createComment(user1, String(postA.id), {
        content: 'Comment on Post A',
      });

      // Attempt to reply on Post B referencing comment from Post A
      await assert.rejects(
        async () => {
          await createComment(user2, String(postB.id), {
            content: 'Cross-post reply attempt',
            parent_comment_id: String(commentA.id),
          });
        },
        {
          name: 'AppError',
          message: 'Parent comment not found',
          statusCode: 404,
        }
      );

      // Post B comment count must remain 0
      assert.equal(db.posts.get(String(postB.id))?.comment_count, 0);
    });

    it('should preserve one-level reply restriction', async () => {
      const post = await createPost(authorId, { content: 'One-level reply test' });
      const rootComment = await createComment(user1, String(post.id), {
        content: 'Root level comment',
      });

      // 1-level reply (valid)
      const firstReply = await createComment(user2, String(post.id), {
        content: 'First level reply',
        parent_comment_id: String(rootComment.id),
      });
      assert.equal(String(firstReply.parent_comment_id), String(rootComment.id));

      // Attempt 2-level reply (reply to a reply)
      await assert.rejects(
        async () => {
          await createComment(user3, String(post.id), {
            content: 'Second level reply attempt',
            parent_comment_id: String(firstReply.id),
          });
        },
        {
          name: 'AppError',
          message: 'Replies can only be one level deep',
          statusCode: 400,
        }
      );

      // Post comment_count should be 2 (root + 1 reply)
      assert.equal(db.posts.get(String(post.id))?.comment_count, 2);
    });

    it('should reject comment creation on a deleted post', async () => {
      const post = await createPost(authorId, { content: 'Post to be deleted' });
      await deletePost(authorId, String(post.id));

      await assert.rejects(
        async () => {
          await createComment(user1, String(post.id), {
            content: 'Comment on deleted post',
          });
        },
        {
          name: 'AppError',
          message: 'Post not found',
          statusCode: 404,
        }
      );
    });
  });

  // ==========================================
  // 4. Database Failure & Invariant Rollback
  // ==========================================
  describe('Database Failure & Invariant Rollback', () => {
    it('should compensate like creation if post counter update fails', async () => {
      const post = await createPost(authorId, { content: 'Fault injection post' });

      // Inject failure on Post.findOneAndUpdate (simulates crash / network timeout)
      db.setFault('Post.findOneAndUpdate', new Error('Simulated DB network outage'));

      await assert.rejects(
        async () => {
          await likePost(user1, String(post.id), { forceFallback: true });
        },
        /Simulated DB network outage/
      );

      db.clearFault('Post.findOneAndUpdate');

      // Verify invariant: No orphaned like exists and counter remains 0
      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.like_count, 0);

      const dbLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id)
      );
      assert.equal(dbLikes.length, 0, 'Orphaned like must not exist after failure');
    });

    it('should compensate comment creation if post counter increment fails', async () => {
      const post = await createPost(authorId, { content: 'Fault comment test' });

      // Inject fault on Post update during comment creation
      db.setFault('Post.findOneAndUpdate', new Error('Simulated write failure on post counter'));

      await assert.rejects(
        async () => {
          await createComment(user1, String(post.id), { content: 'Will fail' }, { forceFallback: true });
        },
        /Simulated write failure on post counter/
      );

      db.clearFault('Post.findOneAndUpdate');

      // Verify invariant: comment document is cleaned up and comment_count remains 0
      const dbPost = db.posts.get(String(post.id));
      assert.equal(dbPost?.comment_count, 0);

      const comments = Array.from(db.comments.values()).filter(
        (c) => String(c.post_id) === String(post.id)
      );
      assert.equal(comments.length, 0, 'Orphaned comment must be rolled back');
    });
  });

  // ==========================================
  // 5. Post Deletion Reliability & Staged Cleanup
  // ==========================================
  describe('Post Deletion Reliability & Staged Cleanup', () => {
    it('should delete a post with no comments and clean up post likes', async () => {
      const post = await createPost(authorId, { content: 'Zero comments post' });
      await likePost(user1, String(post.id));
      await likePost(user2, String(post.id));

      assert.equal(db.posts.get(String(post.id))?.like_count, 2);

      const deleteResult = await deletePost(authorId, String(post.id));
      assert.equal(deleteResult.deleted, true);

      // Verify post is removed from database
      assert.equal(db.posts.has(String(post.id)), false);

      // Verify associated post likes are cleaned up
      const remainingLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id)
      );
      assert.equal(remainingLikes.length, 0);
    });

    it('should delete a post with many comments in bounded batches without unbounded memory', async () => {
      const post = await createPost(authorId, { content: 'Popular post with many comments' });

      // Create 25 comments and like some comments
      const createdCommentIds: string[] = [];
      for (let i = 0; i < 25; i++) {
        const comment = await createComment(user1, String(post.id), {
          content: `Comment number ${i + 1}`,
        });
        createdCommentIds.push(String(comment.id));
        if (i % 2 === 0) {
          await likeComment(user2, String(comment.id));
        }
      }

      assert.equal(db.comments.size, 25);
      const initialCommentLikes = Array.from(db.likes.values()).filter((l) => l.comment_id != null).length;
      assert.ok(initialCommentLikes > 0);

      // Execute staged cleanup with small batch size (batchSize = 10) to test multiple batch iterations
      const cleanupStats = await cleanupPostResources(post.id, 10);

      assert.equal(cleanupStats.commentsDeleted, 25);
      assert.equal(cleanupStats.commentLikesDeleted, initialCommentLikes);
      assert.equal(cleanupStats.postDeleted, true);

      // Verify database state: no remaining comments or likes for this post
      const remainingComments = Array.from(db.comments.values()).filter(
        (c) => String(c.post_id) === String(post.id)
      );
      assert.equal(remainingComments.length, 0);

      const remainingLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id) || (l.comment_id && createdCommentIds.includes(String(l.comment_id)))
      );
      assert.equal(remainingLikes.length, 0);
    });

    it('should handle cleanup failure gracefully and allow retryable recovery', async () => {
      const post = await createPost(authorId, { content: 'Post with failing cleanup' });
      await createComment(user1, String(post.id), { content: 'Comment 1' });
      await createComment(user2, String(post.id), { content: 'Comment 2' });

      // Stage 1: Mark post deleted
      const markedPost = db.posts.get(String(post.id))!;
      markedPost.deleted_at = new Date();

      // Simulate failure during first cleanup attempt
      db.setFault('Comment.find', new Error('Temporary disk IO failure'));

      await assert.rejects(
        async () => {
          await cleanupPostResources(post.id);
        },
        /Temporary disk IO failure/
      );

      db.clearFault('Comment.find');

      // The post is marked with deleted_at, so feed query excludes it
      const feed = await getFeed(user1, 10);
      const postInFeed = feed.items.find((item) => String(item.id) === String(post.id));
      assert.equal(postInFeed, undefined, 'Soft-deleted post must not appear in feed');

      // Recovery: Call retryOrphanedPostCleanups
      const cleanedCount = await retryOrphanedPostCleanups(10);
      assert.equal(cleanedCount, 1);

      // Verify full cleanup completed on retry
      assert.equal(db.posts.has(String(post.id)), false);
      assert.equal(db.comments.size, 0);
    });

    it('should disallow unauthorized post deletion (403 Forbidden)', async () => {
      const post = await createPost(authorId, { content: 'Protected post' });

      await assert.rejects(
        async () => {
          await deletePost(user1, String(post.id)); // user1 is not the author
        },
        {
          name: 'AppError',
          message: 'You are not allowed to delete this post',
          statusCode: 403,
        }
      );

      assert.ok(db.posts.has(String(post.id)));
    });
  });

  // ==========================================
  // 6. Comprehensive Counter Consistency After Every Operation
  // ==========================================
  describe('Full Mutation Sequence Counter Consistency Invariant', () => {
    it('should maintain exact equality between counters and persisted documents throughout lifecycle', async () => {
      // 1. Create post
      const post = await createPost(authorId, { content: 'Lifecycle test post' });
      assertPostCounters(String(post.id), 0, 0);

      // 2. User 1 likes post
      await likePost(user1, String(post.id));
      assertPostCounters(String(post.id), 1, 0);

      // 3. User 2 likes post
      await likePost(user2, String(post.id));
      assertPostCounters(String(post.id), 2, 0);

      // 4. User 1 unlikes post
      await unlikePost(user1, String(post.id));
      assertPostCounters(String(post.id), 1, 0);

      // 5. User 1 comments
      const comment1 = await createComment(user1, String(post.id), { content: 'First comment' });
      assertPostCounters(String(post.id), 1, 1);

      // 6. User 2 comments
      const comment2 = await createComment(user2, String(post.id), { content: 'Second comment' });
      assertPostCounters(String(post.id), 1, 2);

      // 7. User 3 replies to comment1
      await createComment(user3, String(post.id), {
        content: 'Reply to comment 1',
        parent_comment_id: String(comment1.id),
      });
      assertPostCounters(String(post.id), 1, 3);

      // 8. Delete post
      await deletePost(authorId, String(post.id));

      // 9. All post data clean
      assert.equal(db.posts.has(String(post.id)), false);
      const remainingLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === String(post.id)
      );
      assert.equal(remainingLikes.length, 0);
      const remainingComments = Array.from(db.comments.values()).filter(
        (c) => String(c.post_id) === String(post.id)
      );
      assert.equal(remainingComments.length, 0);
    });

    function assertPostCounters(postId: string, expectedLikes: number, expectedComments: number) {
      const dbPost = db.posts.get(postId);
      assert.ok(dbPost, `Post ${postId} must exist`);

      const actualLikes = Array.from(db.likes.values()).filter(
        (l) => String(l.post_id) === postId
      ).length;
      const actualComments = Array.from(db.comments.values()).filter(
        (c) => String(c.post_id) === postId
      ).length;

      assert.equal(
        dbPost.like_count,
        expectedLikes,
        `Post like_count (${dbPost.like_count}) must equal expected (${expectedLikes})`
      );
      assert.equal(
        dbPost.like_count,
        actualLikes,
        `Post like_count (${dbPost.like_count}) must equal actual Likes in DB (${actualLikes})`
      );

      assert.equal(
        dbPost.comment_count,
        expectedComments,
        `Post comment_count (${dbPost.comment_count}) must equal expected (${expectedComments})`
      );
      assert.equal(
        dbPost.comment_count,
        actualComments,
        `Post comment_count (${dbPost.comment_count}) must equal actual Comments in DB (${actualComments})`
      );
    }
  });
});
