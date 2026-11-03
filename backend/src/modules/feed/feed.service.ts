import { Types } from "mongoose";

import Post from "./models/Post.js";
import Like from "./models/Like.js";
import Comment from "./models/Comment.js";
import prisma from "../../config/postgres.js";

import type {
  CreatePostInput,
  CreateCommentInput,
  UpdatePostInput,
} from "./feed.validation.js";

import { AppError } from "../../utils/AppError.js";
import { isMongoDuplicateKeyError } from "../../utils/isMongoDuplicateKeyError.js";
import { runInTransaction, TransactionOptions } from "../../utils/transaction.js";
import {
  runCleanupCycle,
  defaultWorkerConfig,
  cleanupTombstonedPost,
  getActiveWorkerConfig,
  generateWorkerId,
} from "./cleanup.worker.js";

const encodeCursor = (post: {
  created_at: Date;
  _id: Types.ObjectId;
}) => {
  return Buffer.from(
    `${post.created_at.toISOString()}|${post._id}`
  ).toString("base64url");
};

const decodeCursor = (cursor: string) => {
  const [iso, id] = Buffer.from(cursor, "base64url")
    .toString()
    .split("|");

  const date = new Date(iso ?? "");

  if (
    Number.isNaN(date.getTime()) ||
    !id ||
    !Types.ObjectId.isValid(id)
  ) {
    throw new AppError("Invalid cursor", 400);
  }

  return {
    date,
    id: new Types.ObjectId(id),
  };
};

//============= getFeed ===========
export const getFeed = async (
  viewerId: string,
  limit: number,
  cursor?: string
) => {
  const decodedCursor = cursor ? decodeCursor(cursor) : null;

  // Filter out deleted posts (supports legacy posts where deleted_at does not exist)
  const filter: Record<string, unknown> = {
    deleted_at: null,
  };

  if (decodedCursor) {
    filter.$or = [
      {
        created_at: {
          $lt: decodedCursor.date,
        },
      },
      {
        created_at: decodedCursor.date,
        _id: {
          $lt: decodedCursor.id,
        },
      },
    ];
  }

  const rows = await Post.find(filter)
    .sort({
      created_at: -1,
      _id: -1,
    })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;

  const posts = hasMore
    ? rows.slice(0, limit)
    : rows;

  const authorIds = [
    ...new Set(posts.map((post) => post.author_id)),
  ];

  const postIds = posts.map((post) => post._id);

  const [authors, myLikes] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: {
          in: authorIds,
        },
      },
      select: {
        id: true,
        fullName: true,
        photoUrl: true,
      },
    }),

    Like.find({
      user_id: viewerId,
      post_id: {
        $in: postIds,
      },
    })
      .select("post_id")
      .lean(),
  ]);

  const authorMap = new Map(
    authors.map((author) => [author.id, author])
  );

  const likedSet = new Set(
    myLikes.map((like) => String(like.post_id))
  );

  const lastPost = posts[posts.length - 1];

  return {
    items: posts.map((post) => ({
      id: post._id,
      content: post.content,
      image_url: post.image_url,
      skills_tags: post.skills_tags,
      like_count: post.like_count,
      comment_count: post.comment_count,
      created_at: post.created_at,
      liked_by_me: likedSet.has(String(post._id)),
      author: authorMap.get(post.author_id) ?? null,
    })),

    next_cursor:
      hasMore && lastPost
        ? encodeCursor(lastPost)
        : null,
  };
};

//!================== POST ========================

//todo========>Create Post
export const createPost = async (
  authorId: string,
  input: CreatePostInput
) => {
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, fullName: true, photoUrl: true },
  });

  if (!author) {
    throw new AppError("Author not found", 404);
  }

  const post = await Post.create({
    author_id: authorId,
    content: input.content,
    image_url: input.image_url ?? null,
    skills_tags: input.skills_tags,
    like_count: 0,
    comment_count: 0,
    deleted_at: null,
  });

  return {
    id: post._id,
    content: post.content,
    image_url: post.image_url,
    skills_tags: post.skills_tags,
    like_count: post.like_count,
    comment_count: post.comment_count,
    created_at: post.created_at,
    liked_by_me: false,
    author,
  };
};

//todo========> Update Post
export const updatePost = async (
  userId: string,
  postId: string,
  input: UpdatePostInput
) => {
  const post = await Post.findOne({ _id: postId, deleted_at: null }).select("author_id");

  if (!post) {
    throw new AppError("Post not found", 404);
  }

  if (post.author_id !== userId) {
    throw new AppError("You are not allowed to update this post", 403);
  }

  const updatedPost = await Post.findOneAndUpdate(
    {
      _id: postId,
      author_id: userId,
      deleted_at: null,
    },
    {
      $set: input,
    },
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!updatedPost) {
    throw new AppError("Post not found", 404);
  }

  return {
    id: updatedPost._id,
    author_id: updatedPost.author_id,
    content: updatedPost.content,
    image_url: updatedPost.image_url,
    skills_tags: updatedPost.skills_tags,
    like_count: updatedPost.like_count,
    comment_count: updatedPost.comment_count,
    created_at: updatedPost.created_at,
    updated_at: updatedPost.updated_at,
  };
};

//todo========> Like Post 
export const likePost = async (
  userId: string,
  postId: string,
  options?: TransactionOptions
) => {
  return runInTransaction(async (session) => {
    // 1. Verify post exists and is not deleted
    const postQuery = Post.findOne({ _id: postId, deleted_at: null }).select("_id");
    if (session) postQuery.session(session);
    const post = await postQuery;

    if (!post) {
      throw new AppError("Post not found", 404);
    }

    // 2. Insert Like document (unique index prevents duplicates)
    let createdLikeId: Types.ObjectId | null = null;
    try {
      if (session) {
        const [createdLike] = await Like.create(
          [{ user_id: userId, post_id: new Types.ObjectId(postId) }],
          { session }
        );
        createdLikeId = createdLike._id;
      } else {
        const createdLike = await Like.create({
          user_id: userId,
          post_id: new Types.ObjectId(postId),
        });
        createdLikeId = createdLike._id;
      }
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        throw new AppError("Post already liked", 409);
      }
      throw error;
    }

    // 3. Atomically increment post like_count
    let updatedPost;
    try {
      const updateQuery = Post.findOneAndUpdate(
        { _id: postId, deleted_at: null },
        { $inc: { like_count: 1 } },
        {
          new: true,
          select: "like_count",
        }
      );
      if (session) updateQuery.session(session);
      updatedPost = await updateQuery;
    } catch (err) {
      // Standalone compensation on error
      if (!session && createdLikeId) {
        await Like.deleteOne({ _id: createdLikeId }).catch(() => {});
      }
      throw err;
    }

    if (!updatedPost) {
      // Standalone compensation: rollback like if post disappeared concurrently
      if (!session && createdLikeId) {
        await Like.deleteOne({ _id: createdLikeId }).catch(() => {});
      }
      throw new AppError("Post not found", 404);
    }

    return {
      liked: true,
      like_count: updatedPost.like_count,
    };
  }, options);
};

//todo========> unlikePost 
export const unlikePost = async (
  userId: string,
  postId: string,
  options?: TransactionOptions
) => {
  return runInTransaction(async (session) => {
    // 1. Delete like document atomically
    const deleteQuery = Like.findOneAndDelete({
      user_id: userId,
      post_id: postId,
    });
    if (session) deleteQuery.session(session);
    const deletedLike = await deleteQuery;

    if (!deletedLike) {
      throw new AppError("Post not liked", 404);
    }

    // 2. Decrement post like_count safely (prevent negative numbers)
    const updateQuery = Post.findOneAndUpdate(
      { _id: postId },
      [
        {
          $set: {
            like_count: {
              $max: [0, { $subtract: ["$like_count", 1] }],
            },
          },
        },
      ],
      {
        new: true,
        select: "like_count",
      }
    );
    if (session) updateQuery.session(session);
    const updatedPost = await updateQuery;

    if (!updatedPost) {
      throw new AppError("Post not found", 404);
    }

    return {
      liked: false,
      like_count: updatedPost.like_count,
    };
  }, options);
};

//todo==========> Cleanup post resources (Batched & Retryable)
export const cleanupPostResources = async (
  postId: string | Types.ObjectId,
  batchSize = 500
): Promise<{
  commentsDeleted: number;
  commentLikesDeleted: number;
  postLikesDeleted: number;
  postDeleted: boolean;
}> => {
  const targetPostId = typeof postId === "string" ? new Types.ObjectId(postId) : postId;
  let totalCommentsDeleted = 0;
  let totalCommentLikesDeleted = 0;

  // 1. Delete all likes attached directly to the post
  const postLikesResult = await Like.deleteMany({ post_id: targetPostId });
  const postLikesDeleted = postLikesResult.deletedCount ?? 0;

  // 2. Clean up comments and comment likes in bounded batches
  // Streams batches to avoid loading all comment IDs into application memory
  while (true) {
    const commentBatch = await Comment.find({ post_id: targetPostId })
      .select("_id")
      .limit(batchSize)
      .lean();

    if (!commentBatch.length) {
      break;
    }

    const batchIds = commentBatch.map((comment) => comment._id);

    // Delete comment likes for this batch
    const commentLikesResult = await Like.deleteMany({
      comment_id: { $in: batchIds },
    });
    totalCommentLikesDeleted += commentLikesResult.deletedCount ?? 0;

    // Delete the comments in this batch
    const commentsResult = await Comment.deleteMany({
      _id: { $in: batchIds },
    });
    totalCommentsDeleted += commentsResult.deletedCount ?? 0;
  }

  // 3. Delete the tombstoned post record itself
  const deletedPost = await Post.findByIdAndDelete(targetPostId);

  return {
    commentsDeleted: totalCommentsDeleted,
    commentLikesDeleted: totalCommentLikesDeleted,
    postLikesDeleted,
    postDeleted: !!deletedPost,
  };
};

//todo==========> Retry orphaned post cleanups (delegates to atomic leased worker cycle)
export const retryOrphanedPostCleanups = async (limit = 50): Promise<number> => {
  const summary = await runCleanupCycle({
    ...defaultWorkerConfig,
    batchSize: limit,
  });
  return summary.completedCount;
};

//todo==========> Delete Post (Staged Deletion)
export const deletePost = async (
  userId: string,
  postId: string
) => {
  const post = await Post.findOne({ _id: postId })
    .select("author_id deleted_at")
    .lean();

  // Fix F5: Treat null or missing deleted_at as active; reject if already deleted
  if (!post || Boolean(post.deleted_at)) {
    throw new AppError("Post not found", 404);
  }

  if (post.author_id !== userId) {
    throw new AppError(
      "You are not allowed to delete this post",
      403
    );
  }

  // Stage 1: Atomically soft-delete / tombstone the post
  // This makes the post immediately invisible to feed queries and mutations
  const markedPost = await Post.findOneAndUpdate(
    {
      _id: postId,
      author_id: userId,
      deleted_at: null,
    },
    {
      $set: {
        deleted_at: new Date(),
        cleanup_state: {
          status: 'pending',
          claimed_by: null,
          claim_token: null,
          lease_expires_at: null,
          attempt_count: 0,
          last_error: null,
          last_attempt_at: null,
          next_retry_at: new Date(),
        },
      },
    },
    {
      new: true,
    }
  );

  if (!markedPost) {
    throw new AppError("Post not found", 404);
  }

  // Stage 2: Claim the tombstone and run the same leased cleanup path as the worker.
  const result = await cleanupTombstonedPost(markedPost._id, {
    ...getActiveWorkerConfig(),
    workerId: `api-${generateWorkerId()}`,
  });

  if (result.status === 'FAILED' || result.status === 'LEASE_LOST') {
    console.error(
      `[PostCleanup] Initial cleanup did not complete for deleted post ${postId}. Recovery worker will retry:`,
      {
        postId,
        status: result.status,
        error: result.error,
        attemptCount: result.attemptCount,
      }
    );
  } else if (result.status === 'SKIPPED_OWNED') {
    console.warn(
      `[PostCleanup] Cleanup for post ${postId} is already owned by another worker.`
    );
  }

  return {
    id: markedPost._id,
    deleted: true,
  };
};

//!============== Comment ===========================

//todo========> Create Comment 
export const createComment = async (
  authorId: string,
  postId: string,
  input: CreateCommentInput,
  options?: TransactionOptions
) => {
  // Verify author in PostgreSQL first
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: {
      id: true,
      fullName: true,
      photoUrl: true,
    },
  });

  if (!author) {
    throw new AppError("Author not found", 404);
  }

  return runInTransaction(async (session) => {
    // 1. Verify post exists and is not deleted
    const postQuery = Post.findOne({ _id: postId, deleted_at: null }).select("_id");
    if (session) postQuery.session(session);
    const post = await postQuery;

    if (!post) {
      throw new AppError("Post not found", 404);
    }

    // 2. Validate parent comment belongs to the same post and is not a nested reply
    if (input.parent_comment_id) {
      const parentQuery = Comment.findOne({
        _id: input.parent_comment_id,
        post_id: postId,
      }).select("_id parent_comment_id");
      if (session) parentQuery.session(session);
      const parentComment = await parentQuery;

      if (!parentComment) {
        throw new AppError("Parent comment not found", 404);
      }

      if (parentComment.parent_comment_id) {
        throw new AppError(
          "Replies can only be one level deep",
          400
        );
      }
    }

    // 3. Create comment document
    let createdComment: InstanceType<typeof Comment>;
    if (session) {
      const [doc] = await Comment.create(
        [
          {
            post_id: new Types.ObjectId(postId),
            author_id: authorId,
            parent_comment_id: input.parent_comment_id
              ? new Types.ObjectId(input.parent_comment_id)
              : null,
            content: input.content,
            like_count: 0,
          },
        ],
        { session }
      );
      createdComment = doc;
    } else {
      createdComment = await Comment.create({
        post_id: new Types.ObjectId(postId),
        author_id: authorId,
        parent_comment_id: input.parent_comment_id
          ? new Types.ObjectId(input.parent_comment_id)
          : null,
        content: input.content,
        like_count: 0,
      });
    }

    // 4. Increment post comment_count
    let updatedPost;
    try {
      const postUpdateQuery = Post.findOneAndUpdate(
        { _id: postId, deleted_at: null },
        { $inc: { comment_count: 1 } },
        { new: true, select: "_id" }
      );
      if (session) postUpdateQuery.session(session);
      updatedPost = await postUpdateQuery;
    } catch (err) {
      // Standalone compensation
      if (!session) {
        await Comment.deleteOne({ _id: createdComment._id }).catch(() => {});
      }
      throw err;
    }

    if (!updatedPost) {
      // Standalone compensation: rollback created comment if post disappeared
      if (!session) {
        await Comment.deleteOne({ _id: createdComment._id }).catch(() => {});
      }
      throw new AppError("Post not found", 404);
    }

    return {
      id: createdComment._id,
      post_id: createdComment.post_id,
      parent_comment_id: createdComment.parent_comment_id,
      content: createdComment.content,
      like_count: createdComment.like_count,
      created_at: createdComment.created_at,
      author,
    };
  }, options);
};

//todo========> Like Comment 
export const likeComment = async (
  userId: string,
  commentId: string,
  options?: TransactionOptions
) => {
  return runInTransaction(async (session) => {
    // 1. Verify comment exists
    const commentQuery = Comment.findById(commentId).select("_id");
    if (session) commentQuery.session(session);
    const comment = await commentQuery;

    if (!comment) {
      throw new AppError("Comment not found", 404);
    }

    // 2. Insert Like document
    let createdLikeId: Types.ObjectId | null = null;
    try {
      if (session) {
        const [createdLike] = await Like.create(
          [{ user_id: userId, comment_id: new Types.ObjectId(commentId) }],
          { session }
        );
        createdLikeId = createdLike._id;
      } else {
        const createdLike = await Like.create({
          user_id: userId,
          comment_id: new Types.ObjectId(commentId),
        });
        createdLikeId = createdLike._id;
      }
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        throw new AppError("Comment already liked", 409);
      }
      throw error;
    }

    // 3. Atomically increment comment like_count
    let updatedComment;
    try {
      const updateQuery = Comment.findByIdAndUpdate(
        commentId,
        { $inc: { like_count: 1 } },
        {
          new: true,
          select: "like_count",
        }
      );
      if (session) updateQuery.session(session);
      updatedComment = await updateQuery;
    } catch (err) {
      if (!session && createdLikeId) {
        await Like.deleteOne({ _id: createdLikeId }).catch(() => {});
      }
      throw err;
    }

    if (!updatedComment) {
      if (!session && createdLikeId) {
        await Like.deleteOne({ _id: createdLikeId }).catch(() => {});
      }
      throw new AppError("Comment not found", 404);
    }

    return {
      liked: true,
      like_count: updatedComment.like_count,
    };
  }, options);
};

//todo========> Unlike Comment 
export const unlikeComment = async (
  userId: string,
  commentId: string,
  options?: TransactionOptions
) => {
  return runInTransaction(async (session) => {
    // 1. Delete like document atomically
    const deleteQuery = Like.findOneAndDelete({
      user_id: userId,
      comment_id: commentId,
    });
    if (session) deleteQuery.session(session);
    const deletedLike = await deleteQuery;

    if (!deletedLike) {
      throw new AppError("Comment not liked", 404);
    }

    // 2. Decrement comment like_count safely (guarded against negative values)
    const updateQuery = Comment.findByIdAndUpdate(
      commentId,
      [
        {
          $set: {
            like_count: {
              $max: [0, { $subtract: ["$like_count", 1] }],
            },
          },
        },
      ],
      {
        new: true,
        select: "like_count",
      }
    );
    if (session) updateQuery.session(session);
    const updatedComment = await updateQuery;

    if (!updatedComment) {
      throw new AppError("Comment not found", 404);
    }

    return {
      liked: false,
      like_count: updatedComment.like_count,
    };
  }, options);
};

//todo========> Get Comments 
export const getComments = async (
  viewerId: string,
  postId: string,
  limit: number,
  cursor?: string
) => {
  // Exclude deleted posts
  const post = await Post.findOne({ _id: postId, deleted_at: null }).select("_id");

  if (!post) {
    throw new AppError("Post not found", 404);
  }

  const decodedCursor = cursor ? decodeCursor(cursor) : null;

  // Top-level comments only
  const rows = await Comment.find(
    decodedCursor
      ? {
          post_id: postId,
          parent_comment_id: null,
          $or: [
            { created_at: { $gt: decodedCursor.date } },
            { created_at: decodedCursor.date, _id: { $gt: decodedCursor.id } },
          ],
        }
      : { post_id: postId, parent_comment_id: null }
  )
    .sort({ created_at: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const topLevelComments = hasMore ? rows.slice(0, limit) : rows;
  const topLevelIds = topLevelComments.map((comment) => comment._id);

  // Replies for this page of top-level comments
  const replies = await Comment.find({
    post_id: postId,
    parent_comment_id: { $in: topLevelIds },
  })
    .sort({ created_at: 1, _id: 1 })
    .lean();

  const repliesByParent = new Map<string, typeof replies>();

  for (const reply of replies) {
    const key = String(reply.parent_comment_id);

    if (!repliesByParent.has(key)) {
      repliesByParent.set(key, []);
    }

    repliesByParent.get(key)!.push(reply);
  }

  const allComments = [...topLevelComments, ...replies];
  const allCommentIds = allComments.map((comment) => comment._id);

  const authorIds = [
    ...new Set(allComments.map((comment) => comment.author_id)),
  ];

  const [authors, likedComments] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, fullName: true, photoUrl: true },
    }),

    allCommentIds.length
      ? Like.find({
          user_id: viewerId,
          comment_id: { $in: allCommentIds },
        })
          .select("comment_id")
          .lean()
      : Promise.resolve([]),
  ]);

  const authorMap = new Map(authors.map((author) => [author.id, author]));

  const likedCommentIds = new Set(
    likedComments.map((like) => String(like.comment_id))
  );

  const toItem = (comment: (typeof allComments)[number]) => ({
    id: comment._id,
    post_id: comment.post_id,
    author: authorMap.get(comment.author_id) ?? null,
    parent_comment_id: comment.parent_comment_id,
    content: comment.content,
    like_count: comment.like_count,
    liked_by_me: likedCommentIds.has(String(comment._id)),
    created_at: comment.created_at,
  });

  const lastTopLevel = topLevelComments[topLevelComments.length - 1];

  return {
    items: topLevelComments.map((comment) => ({
      ...toItem(comment),
      replies: (repliesByParent.get(String(comment._id)) ?? []).map(toItem),
    })),

    next_cursor:
      hasMore && lastTopLevel ? encodeCursor(lastTopLevel) : null,
  };
};
