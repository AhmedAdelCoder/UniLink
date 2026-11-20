import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MockDatabaseFixture } from './fixtures/mockDb.js';
import {
  createPostController,
  likePostController,
  unlikePostController,
  createCommentController,
  likeCommentController,
  unlikeCommentController,
  deletePostController,
  getFeedController,
} from '../src/modules/feed/feed.controller.js';
import type { Request, Response } from 'express';

interface MockResponse {
  statusCode: number;
  data: Record<string, unknown> | null;
  status: (code: number) => MockResponse;
  json: (body: Record<string, unknown>) => MockResponse;
}

const createMockRes = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      this.data = body;
      return this;
    },
  };
  return res;
};

describe('UniLink Feed Controller Layer - HTTP Response Contracts', () => {
  const db = new MockDatabaseFixture();

  const authorId = 'auth-user-111';
  const viewerId = 'viewer-user-222';

  before(() => {
    db.install();
  });

  after(() => {
    db.restore();
  });

  beforeEach(() => {
    db.reset();

    db.users.set(authorId, {
      id: authorId,
      fullName: 'Author User',
      photoUrl: 'https://example.com/avatar1.jpg',
    });
    db.users.set(viewerId, {
      id: viewerId,
      fullName: 'Viewer User',
      photoUrl: 'https://example.com/avatar2.jpg',
    });
  });

  it('createPostController returns 201 with created post payload', async () => {
    const req = {
      user: { userId: authorId, role: 'STUDENT' },
      body: { content: 'Hello from controller test' },
    } as unknown as Request;

    const res = createMockRes();
    await createPostController(req, res as unknown as Response, () => {});

    assert.equal(res.statusCode, 201);
    assert.equal(res.data?.success, true);
    const postData = res.data?.data as Record<string, unknown>;
    assert.equal(postData?.content, 'Hello from controller test');
    assert.equal(postData?.like_count, 0);
  });

  it('likePostController and unlikePostController return 201 and 200 contracts', async () => {
    // 1. Create post
    const createReq = {
      user: { userId: authorId, role: 'STUDENT' },
      body: { content: 'Like controller test' },
    } as unknown as Request;
    const createRes = createMockRes();
    await createPostController(createReq, createRes as unknown as Response, () => {});
    const postId = (createRes.data?.data as Record<string, unknown>).id;

    // 2. Like post (201)
    const likeReq = {
      user: { userId: viewerId, role: 'STUDENT' },
      validated: { params: { postId } },
    } as unknown as Request;
    const likeRes = createMockRes();
    await likePostController(likeReq, likeRes as unknown as Response, () => {});

    assert.equal(likeRes.statusCode, 201);
    assert.equal(likeRes.data?.success, true);
    assert.deepEqual(likeRes.data?.data, { liked: true, like_count: 1 });

    // 3. Unlike post (200)
    const unlikeReq = {
      user: { userId: viewerId, role: 'STUDENT' },
      validated: { params: { postId } },
    } as unknown as Request;
    const unlikeRes = createMockRes();
    await unlikePostController(unlikeReq, unlikeRes as unknown as Response, () => {});

    assert.equal(unlikeRes.statusCode, 200);
    assert.equal(unlikeRes.data?.success, true);
    assert.deepEqual(unlikeRes.data?.data, { liked: false, like_count: 0 });
  });

  it('createCommentController, likeCommentController, and unlikeCommentController contracts', async () => {
    // 1. Create post
    const createPostReq = {
      user: { userId: authorId, role: 'STUDENT' },
      body: { content: 'Comment controller test' },
    } as unknown as Request;
    const createPostRes = createMockRes();
    await createPostController(createPostReq, createPostRes as unknown as Response, () => {});
    const postId = (createPostRes.data?.data as Record<string, unknown>).id;

    // 2. Create comment (201)
    const commentReq = {
      user: { userId: viewerId, role: 'STUDENT' },
      validated: { params: { postId } },
      body: { content: 'Insightful post!' },
    } as unknown as Request;
    const commentRes = createMockRes();
    await createCommentController(commentReq, commentRes as unknown as Response, () => {});

    assert.equal(commentRes.statusCode, 201);
    assert.equal(commentRes.data?.success, true);
    const commentData = commentRes.data?.data as Record<string, unknown>;
    assert.equal(commentData.content, 'Insightful post!');

    // 3. Like comment (201)
    const likeCommentReq = {
      user: { userId: authorId, role: 'STUDENT' },
      validated: { params: { commentId: commentData.id } },
    } as unknown as Request;
    const likeCommentRes = createMockRes();
    await likeCommentController(likeCommentReq, likeCommentRes as unknown as Response, () => {});

    assert.equal(likeCommentRes.statusCode, 201);
    assert.deepEqual(likeCommentRes.data?.data, { liked: true, like_count: 1 });

    // 4. Unlike comment (200)
    const unlikeCommentReq = {
      user: { userId: authorId, role: 'STUDENT' },
      validated: { params: { commentId: commentData.id } },
    } as unknown as Request;
    const unlikeCommentRes = createMockRes();
    await unlikeCommentController(unlikeCommentReq, unlikeCommentRes as unknown as Response, () => {});

    assert.equal(unlikeCommentRes.statusCode, 200);
    assert.deepEqual(unlikeCommentRes.data?.data, { liked: false, like_count: 0 });
  });

  it('deletePostController returns 200 with id and deleted: true', async () => {
    const createPostReq = {
      user: { userId: authorId, role: 'STUDENT' },
      body: { content: 'Post to delete via controller' },
    } as unknown as Request;
    const createPostRes = createMockRes();
    await createPostController(createPostReq, createPostRes as unknown as Response, () => {});
    const postId = (createPostRes.data?.data as Record<string, unknown>).id;

    const deleteReq = {
      user: { userId: authorId, role: 'STUDENT' },
      validated: { params: { postId } },
    } as unknown as Request;
    const deleteRes = createMockRes();
    await deletePostController(deleteReq, deleteRes as unknown as Response, () => {});

    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.data?.success, true);
    assert.deepEqual(deleteRes.data?.data, { id: postId, deleted: true });
  });

  it('getFeedController returns 200 with items and excludes deleted posts', async () => {
    // Create 2 posts
    const createPostReq1 = {
      user: { userId: authorId, role: 'STUDENT' },
      body: { content: 'Post 1' },
    } as unknown as Request;
    const createPostRes1 = createMockRes();
    await createPostController(createPostReq1, createPostRes1 as unknown as Response, () => {});
    const post1Id = (createPostRes1.data?.data as Record<string, unknown>).id;

    const createPostReq2 = {
      user: { userId: authorId, role: 'STUDENT' },
      body: { content: 'Post 2' },
    } as unknown as Request;
    const createPostRes2 = createMockRes();
    await createPostController(createPostReq2, createPostRes2 as unknown as Response, () => {});

    // Delete Post 1
    const deleteReq = {
      user: { userId: authorId, role: 'STUDENT' },
      validated: { params: { postId: post1Id } },
    } as unknown as Request;
    const deleteRes = createMockRes();
    await deletePostController(deleteReq, deleteRes as unknown as Response, () => {});

    // Query Feed
    const feedReq = {
      user: { userId: viewerId, role: 'STUDENT' },
      validated: { query: { limit: 10 } },
    } as unknown as Request;
    const feedRes = createMockRes();
    await getFeedController(feedReq, feedRes as unknown as Response, () => {});

    assert.equal(feedRes.statusCode, 200);
    const feedData = feedRes.data?.data as { items: Array<{ id: string; content: string }> };
    assert.equal(feedData.items.length, 1);
    assert.equal(feedData.items[0].content, 'Post 2');
    assert.ok(!feedData.items.some((i) => String(i.id) === String(post1Id)), 'Deleted post 1 must be excluded from feed');
  });
});
