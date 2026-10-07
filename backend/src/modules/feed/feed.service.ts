import { Types } from "mongoose";

import Post from "./models/Post.js";
import Like from "./models/Like.js";
import Comment from "./models/Comment.js";
import prisma from "../../config/postgres.js";
import type {
  CreatePostInput,
  GetFeedQuery,
  PostIdParam,
  CreateCommentInput,
} from "./feed.validation.js";

import { AppError } from "../../utils/AppError.js";
import { isMongoDuplicateKeyError } from "../../utils/isMongoDuplicateKeyError.js";


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

  const rows = await Post.find(
    decodedCursor
      ? {
          $or: [
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
          ],
        }
      : {}
  )
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

//========== Create Post ==========
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

// ========== Like Post ==========
export const likePost = async (
  userId: string,
  postId: string
) => {
  const post = await Post.findById(postId).select("_id");

  if (!post) {
    throw new AppError("Post not found", 404);
  }

  try {
    await Like.create({
      user_id: userId,
      post_id: postId,
    });
  } catch (error: unknown) {
    if (isMongoDuplicateKeyError(error)) {
      throw new AppError("Post already liked", 409);
    }

    throw error;
  }

  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { $inc: { like_count: 1 } },
    {
      new: true,
      select: "like_count",
    }
  );

  if (!updatedPost) {
    throw new AppError("Post not found", 404);
  }

  return {
    liked: true,
    like_count: updatedPost.like_count,
  };
};

//============ unlikePost =================
export const unlikePost = async (
  userId: string,
  postId: string
) => {
  const deletedLike = await Like.findOneAndDelete({
    user_id: userId,
    post_id: postId,
  });

  if (!deletedLike) {
    throw new AppError("Post not liked", 404);
  }

  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { $inc: { like_count: -1 } },
    {
      new: true,
      select: "like_count",
    }
  );

  if (!updatedPost) {
    throw new AppError("Post not found", 404);
  }

  return {
    liked: false,
    like_count: updatedPost.like_count,
  };
};

// ========== Create Comment ==========
export const createComment = async (
  authorId: string,
  postId: string,
  input: CreateCommentInput
) => {
  const [post, author] = await Promise.all([
    Post.findById(postId).select("_id"),
    prisma.user.findUnique({
      where: { id: authorId },
      select: {
        id: true,
        fullName: true,
        photoUrl: true,
      },
    }),
  ]);

  if (!post) {
    throw new AppError("Post not found", 404);
  }

  if (!author) {
    throw new AppError("Author not found", 404);
  }

  if (input.parent_comment_id) {
    const parentComment = await Comment.findOne({
      _id: input.parent_comment_id,
      post_id: postId,
    }).select("_id parent_comment_id");

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

  const comment = await Comment.create({
    post_id: postId,
    author_id: authorId,
    parent_comment_id: input.parent_comment_id ?? null,
    content: input.content,
    like_count: 0,
  });

  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    { $inc: { comment_count: 1 } }
  );

  if (!updatedPost) {
    console.error(
      `comment_count not incremented: post ${postId} not found after comment ${comment._id}`
    );
  }

  return {
    id: comment._id,
    post_id: comment.post_id,
    parent_comment_id: comment.parent_comment_id,
    content: comment.content,
    like_count: comment.like_count,
    created_at: comment.created_at,
    author,
  };
};


// ========== Get Comments ==========
export const getComments = async (
  postId: string,
  limit: number,
  cursor?: string
) => {
  const post = await Post.findById(postId).select("_id");

  if (!post) {
    throw new AppError("Post not found", 404);
  }

  const decodedCursor = cursor ? decodeCursor(cursor) : null;

  // Get top-level comments only
  const rows = await Comment.find(
    decodedCursor
      ? {
          post_id: postId,
          parent_comment_id: null,
          $or: [
            {
              created_at: {
                $gt: decodedCursor.date,
              },
            },
            {
              created_at: decodedCursor.date,
              _id: {
                $gt: decodedCursor.id,
              },
            },
          ],
        }
      : {
          post_id: postId,
          parent_comment_id: null,
        }
  )
    .sort({
      created_at: 1,
      _id: 1,
    })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;

  const topLevelComments = hasMore
    ? rows.slice(0, limit)
    : rows;

  const topLevelIds = topLevelComments.map(
    (comment) => comment._id
  );

  // Get replies for the current page of top-level comments
  const replies = await Comment.find({
    post_id: postId,
    parent_comment_id: {
      $in: topLevelIds,
    },
  })
    .sort({
      created_at: 1,
      _id: 1,
    })
    .lean();

  // Group replies by their parent comment
  const repliesByParent = new Map<
    string,
    typeof replies
  >();

  for (const reply of replies) {
    const key = String(reply.parent_comment_id);

    if (!repliesByParent.has(key)) {
      repliesByParent.set(key, []);
    }

    repliesByParent.get(key)!.push(reply);
  }

  // Get authors for both comments and replies
  const allComments = [
    ...topLevelComments,
    ...replies,
  ];

  const authorIds = [
    ...new Set(
      allComments.map((comment) => comment.author_id)
    ),
  ];

  const authors = await prisma.user.findMany({
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
  });

  const authorMap = new Map(
    authors.map((author) => [author.id, author])
  );

  const toItem = (
    comment: (typeof allComments)[number]
  ) => ({
    id: comment._id,
    post_id: comment.post_id,
    author:
      authorMap.get(comment.author_id) ?? null,
    parent_comment_id: comment.parent_comment_id,
    content: comment.content,
    like_count: comment.like_count,
    created_at: comment.created_at,
  });

  const lastTopLevel =
    topLevelComments[topLevelComments.length - 1];

  return {
    items: topLevelComments.map((comment) => ({
      ...toItem(comment),
      replies: (
        repliesByParent.get(String(comment._id)) ?? []
      ).map(toItem),
    })),

    next_cursor:
      hasMore && lastTopLevel
        ? encodeCursor(lastTopLevel)
        : null,
  };
};